/**
 * git source — clone a repo, auto-detect install/build, then spawn.
 *
 * State checkout: at most one of branch / tag / commit. Default: remote HEAD.
 * Install/build auto-detection (overridable):
 *   - package.json  → npm install (+ npm run build if scripts.build exists)
 *   - pyproject.toml → uv pip install -e .
 *   - requirements.txt → uv pip install -r requirements.txt
 * Override with `install: [...]` and/or `build: [...]` arrays in config.
 *
 * ${REPO_DIR} in args resolves to the clone directory.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import logger from '../../logging/logger.js';
import { getGatewayConfig } from '../registry.js';
import { BaseServer } from './base.js';

function runShell(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (exit ${code})`));
    });
    child.on('error', reject);
  });
}

function runCommandLine(line, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(line, { cwd, env, stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (exit ${code}): ${line}`));
    });
    child.on('error', reject);
  });
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function detectInstall(repoDir) {
  if (await fileExists(path.join(repoDir, 'package.json'))) return ['npm install'];
  if (await fileExists(path.join(repoDir, 'pyproject.toml'))) return ['uv pip install -e .'];
  if (await fileExists(path.join(repoDir, 'requirements.txt'))) return ['uv pip install -r requirements.txt'];
  return null;
}

async function detectBuild(repoDir) {
  const pkgJsonPath = path.join(repoDir, 'package.json');
  if (await fileExists(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.build) return ['npm run build'];
    } catch {}
  }
  return null;
}

export class GitServer extends BaseServer {
  constructor(serverName, config) {
    super(serverName, config);
    this.repoDir = null;
  }

  async prepare() {
    const { repo, branch, tag, commit } = this.config;
    const reposRoot = getGatewayConfig().storage.repos;
    this.repoDir = path.resolve(reposRoot, this.serverName);

    if (!(await fileExists(this.repoDir))) {
      await fs.mkdir(path.dirname(this.repoDir), { recursive: true });
      logger.info(`Cloning ${repo} into ${this.repoDir}`, { branch, tag, commit });
      const cloneArgs = ['clone'];
      if (branch) cloneArgs.push('--branch', branch);
      else if (tag) cloneArgs.push('--branch', tag);
      cloneArgs.push(repo, this.repoDir);
      await runShell('git', cloneArgs, path.dirname(this.repoDir));
      if (commit) {
        await runShell('git', ['checkout', commit], this.repoDir);
      }
    } else {
      logger.debug(`Repo already exists at ${this.repoDir}, skipping clone`);
    }

    const installSteps = this.config.install ?? await detectInstall(this.repoDir);
    if (installSteps) {
      logger.info(`Running install steps for ${this.serverName}`, { steps: installSteps });
      for (const step of installSteps) await runCommandLine(step, this.repoDir, process.env);
    }

    const buildSteps = this.config.build ?? await detectBuild(this.repoDir);
    if (buildSteps) {
      logger.info(`Running build steps for ${this.serverName}`, { steps: buildSteps });
      for (const step of buildSteps) await runCommandLine(step, this.repoDir, process.env);
    }
  }

  async getSpawnArgs() {
    const { command, args = [], env = {} } = this.config;
    const resolvedArgs = args.map(a => a.replace(/\$\{REPO_DIR\}/g, this.repoDir));
    return { command, args: resolvedArgs, env, cwd: this.repoDir };
  }
}

export function createGitServer(serverName, config) {
  return new GitServer(serverName, config);
}

export default { GitServer, createGitServer };
