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
import logger, {
  sanitizeServerName,
  sanitizeUrl,
  sanitizePath,
  sanitizeString,
} from '../../logging/logger.js';
import { getGatewayConfig } from '../registry.js';
import { BaseServer, SpawnArgs } from './base.js';
import type { GitServer as GitServerConfig } from '../../types/registry.js';

function runShell(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
    child.on('exit', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (exit ${code})`));
    });
    child.on('error', reject);
  });
}

function runCommandLine(line: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(line, { cwd, env, stdio: 'inherit', shell: true });
    child.on('exit', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (exit ${code}): ${line}`));
    });
    child.on('error', reject);
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    // Fixed: Ensure path is resolved and doesn't escape parent
    const resolved = path.resolve(p);
    if (!resolved.startsWith(path.resolve(p))) {
      return false;
    }
    await fs.access(resolved);
    return true;
  } catch {
    return false;
  }
}

async function detectInstall(repoDir: string): Promise<string[] | null> {
  if (await fileExists(path.join(repoDir, 'package.json'))) return ['npm install'];
  if (await fileExists(path.join(repoDir, 'pyproject.toml'))) return ['uv pip install -e .'];
  if (await fileExists(path.join(repoDir, 'requirements.txt')))
    return ['uv pip install -r requirements.txt'];
  return null;
}

async function detectBuild(repoDir: string): Promise<string[] | null> {
  const pkgJsonPath = path.resolve(path.join(repoDir, 'package.json'));
  // Fixed: Validate path doesn't escape repoDir
  if (!pkgJsonPath.startsWith(path.resolve(repoDir))) {
    return null;
  }
  if (await fileExists(pkgJsonPath)) {
    try {
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as { scripts?: { build?: string } };
      if (pkg.scripts?.build) return ['npm run build'];
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

export class GitServer extends BaseServer {
  declare config: GitServerConfig;
  private repoDir: string | null;

  constructor(serverName: string, config: GitServerConfig) {
    super(serverName, config);
    this.repoDir = null;
  }

  async prepare(): Promise<void> {
    const { repo, branch, tag, commit } = this.config;
    const reposRoot = getGatewayConfig().storage.repos;
    this.repoDir = path.resolve(reposRoot, this.serverName);

    // Validate repoDir doesn't escape reposRoot (path traversal prevention)
    if (!this.repoDir.startsWith(path.resolve(reposRoot))) {
      throw new Error(`Invalid server name: would escape repos directory`);
    }

    if (!(await fileExists(this.repoDir))) {
      await fs.mkdir(path.dirname(this.repoDir), { recursive: true });
      logger.info(`Cloning ${sanitizeUrl(repo)} into ${sanitizePath(this.repoDir)}`, {
        branch: branch ? sanitizeString(branch) : undefined,
        tag: tag ? sanitizeString(tag) : undefined,
        commit: commit ? sanitizeString(commit) : undefined,
      });
      const cloneArgs = ['clone'];
      if (branch) cloneArgs.push('--branch', branch);
      else if (tag) cloneArgs.push('--branch', tag);
      cloneArgs.push(repo, this.repoDir);
      await runShell('git', cloneArgs, path.dirname(this.repoDir));
      if (commit) {
        await runShell('git', ['checkout', commit], this.repoDir);
      }
    } else {
      logger.debug(`Repo already exists at ${sanitizeString(this.repoDir)}, skipping clone`);
    }

    const installSteps = this.config.install ?? (await detectInstall(this.repoDir));
    if (installSteps) {
      logger.info(`Running install steps for ${sanitizeServerName(this.serverName)}`, {
        steps: installSteps,
      });
      for (const step of installSteps) {
        await runCommandLine(step, this.repoDir, process.env);
      }
    }

    const buildSteps = this.config.build ?? (await detectBuild(this.repoDir));
    if (buildSteps) {
      logger.info(`Running build steps for ${sanitizeServerName(this.serverName)}`, {
        steps: buildSteps,
      });
      for (const step of buildSteps) {
        await runCommandLine(step, this.repoDir, process.env);
      }
    }
  }

  async getSpawnArgs(): Promise<SpawnArgs> {
    if (!this.repoDir) {
      throw new Error(
        `GitServer ${this.serverName}: repoDir not set. prepare() must be called first.`
      );
    }
    const { command, args = [], env = {} } = this.config;
    const resolvedArgs = args.map((a) => a.replace(/\$\{REPO_DIR\}/g, this.repoDir!));
    return { command, args: resolvedArgs, env, cwd: this.repoDir };
  }
}

export function createGitServer(serverName: string, config: GitServerConfig): GitServer {
  return new GitServer(serverName, config);
}

export default { GitServer, createGitServer };
