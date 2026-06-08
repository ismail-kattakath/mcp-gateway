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
import logger, { sanitizeUrl, sanitizePath, sanitizeString } from '../../logging/logger.js';
import { getGatewayConfig } from '../registry.js';
import { BaseServer, SpawnArgs } from './base.js';
import type { ContainerServer as ContainerServerConfig } from '../../types/registry.js';

function runShell(
  command: string,
  args: string[],
  cwd?: string,
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

async function pathExists(p: string): Promise<boolean> {
  try {
    // Fixed: Ensure path is resolved and validated
    const resolved = path.resolve(p);
    await fs.access(resolved);
    return true;
  } catch {
    return false;
  }
}

export class ContainerServer extends BaseServer {
  declare config: ContainerServerConfig;
  private imageRef: string | null;

  constructor(serverName: string, config: ContainerServerConfig) {
    super(serverName, config);
    this.imageRef = null;
  }

  async prepare(): Promise<void> {
    const { image, build, pull = 'missing' } = this.config;

    if (image) {
      this.imageRef = image;
      if (pull === 'always' || (pull === 'missing' && !(await this.imageExistsLocally(image)))) {
        logger.info(`Pulling image: ${sanitizeString(image)}`);
        await runShell('docker', ['pull', image]);
      }
      return;
    }

    if (!build) {
      throw new Error(`ContainerServer ${this.serverName}: must specify either image or build`);
    }

    // Build path
    const reposRoot = getGatewayConfig().storage.repos;
    let contextDir: string;

    if (build.repo) {
      const repoDir = path.resolve(reposRoot, this.serverName);
      // Fixed: Validate repoDir doesn't escape reposRoot
      if (!repoDir.startsWith(path.resolve(reposRoot))) {
        throw new Error(`Invalid server name: would escape repos directory`);
      }
      if (!(await pathExists(repoDir))) {
        await fs.mkdir(path.dirname(repoDir), { recursive: true });
        logger.info(
          `Cloning ${sanitizeString(sanitizeUrl(build.repo))} into ${sanitizeString(sanitizePath(repoDir))}`
        );
        // Fixed: Validate repo URL format to prevent command injection
        const repoUrl = new URL(build.repo);
        if (!['http:', 'https:', 'git:', 'ssh:'].includes(repoUrl.protocol)) {
          throw new Error(`Invalid repo URL protocol: ${repoUrl.protocol}`);
        }
        await runShell('git', ['clone', '--', build.repo, repoDir], path.dirname(repoDir));
      }
      contextDir = path.resolve(repoDir, build.context || '.');
    } else {
      contextDir = path.resolve(process.cwd(), build.context || '.');
    }

    this.imageRef = `mcp-gateway/${this.serverName}:latest`;
    const buildArgs = [
      'build',
      '-t',
      this.imageRef,
      '-f',
      path.join(contextDir, build.dockerfile || 'Dockerfile'),
    ];
    for (const [k, v] of Object.entries(build.args || {})) {
      buildArgs.push('--build-arg', `${k}=${v}`);
    }
    buildArgs.push(contextDir);
    logger.info('Building image', {
      imageRef: sanitizeString(this.imageRef ?? ''),
      context: sanitizePath(contextDir),
    });
    await runShell('docker', buildArgs);
  }

  async imageExistsLocally(image: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('docker', ['image', 'inspect', image], { stdio: 'ignore' });
      child.on('exit', (code: number | null) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  async getSpawnArgs(): Promise<SpawnArgs> {
    if (!this.imageRef) {
      throw new Error(
        `ContainerServer ${this.serverName}: imageRef not set. prepare() must be called first.`
      );
    }

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

export function createContainerServer(
  serverName: string,
  config: ContainerServerConfig
): ContainerServer {
  return new ContainerServer(serverName, config);
}

export default { ContainerServer, createContainerServer };
