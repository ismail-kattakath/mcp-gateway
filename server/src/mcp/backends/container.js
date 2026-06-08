/**
 * container source — run a docker container.
 *
 * Accepts either `image` (pull from registry) or `build` (build locally,
 * optionally cloning a git repo first).
 * Container is launched with `docker run -i --rm` so MCP stdio works.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
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

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export class ContainerServer extends BaseServer {
  constructor(serverName, config) {
    super(serverName, config);
    this.imageRef = null;
  }

  async prepare() {
    const { image, build, pull = 'missing' } = this.config;

    if (image) {
      this.imageRef = image;
      if (pull === 'always' || (pull === 'missing' && !(await this.imageExistsLocally(image)))) {
        logger.info(`Pulling image: ${image}`);
        await runShell('docker', ['pull', image]);
      }
      return;
    }

    // Build path
    const reposRoot = getGatewayConfig().storage.repos;
    let contextDir;

    if (build.repo) {
      const repoDir = path.resolve(reposRoot, this.serverName);
      if (!(await pathExists(repoDir))) {
        await fs.mkdir(path.dirname(repoDir), { recursive: true });
        logger.info(`Cloning ${build.repo} into ${repoDir}`);
        await runShell('git', ['clone', build.repo, repoDir], path.dirname(repoDir));
      }
      contextDir = path.resolve(repoDir, build.context || '.');
    } else {
      contextDir = path.resolve(process.cwd(), build.context || '.');
    }

    this.imageRef = `mcp-gateway/${this.serverName}:latest`;
    const buildArgs = ['build', '-t', this.imageRef, '-f', path.join(contextDir, build.dockerfile || 'Dockerfile')];
    for (const [k, v] of Object.entries(build.args || {})) {
      buildArgs.push('--build-arg', `${k}=${v}`);
    }
    buildArgs.push(contextDir);
    logger.info(`Building image: ${this.imageRef}`);
    await runShell('docker', buildArgs);
  }

  async imageExistsLocally(image) {
    return new Promise((resolve) => {
      const child = spawn('docker', ['image', 'inspect', image], { stdio: 'ignore' });
      child.on('exit', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  async getSpawnArgs() {
    const { volumes = [], ports = {}, env = {} } = this.config;
    const args = ['run', '-i', '--rm', '--name', `mcp-gateway-${this.serverName}-${Date.now()}`];

    for (const v of volumes) args.push('-v', v);
    for (const [containerPort, hostPort] of Object.entries(ports)) {
      args.push('-p', `${hostPort}:${containerPort}`);
    }
    for (const [k, v] of Object.entries(env)) {
      args.push('-e', `${k}=${v}`);
    }
    args.push(this.imageRef);

    return { command: 'docker', args, env: {} };
  }
}

export function createContainerServer(serverName, config) {
  return new ContainerServer(serverName, config);
}

export default { ContainerServer, createContainerServer };
