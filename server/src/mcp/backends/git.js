/**
 * Git Backend Spawner
 *
 * Handles git-npm, git-python, git-docker backend types
 * Clones repos, runs build steps, then spawns with appropriate runtime
 */

import { simpleGit } from 'simple-git';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import logger from '../../logging/logger.js';
import { EventEmitter } from 'events';
import { createDockerBackend } from './docker.js';
import { createStdoutHandler, createStderrHandler } from './stdio-handler.js';

export class GitBackend extends EventEmitter {
  constructor(backendId, config) {
    super();
    this.backendId = backendId;
    this.config = config;
    this.process = null;
    this.dockerBackend = null; // For git-docker type
    this.state = 'stopped';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
    this.repoPath = null;
    this.isBuilt = false;
  }

  addLog(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.emit('log', entry);
  }

  /**
   * Get repo directory path
   */
  getRepoPath() {
    const reposDir = process.env.MCP_REPOS_DIR || path.join(os.homedir(), '.mcp', 'repos');
    return path.join(reposDir, this.backendId);
  }

  /**
   * Clone repository if not already cloned
   */
  async cloneRepo() {
    const { install } = this.config;
    this.repoPath = this.getRepoPath();

    try {
      // Check if repo already exists
      const exists = await fs.access(this.repoPath).then(() => true).catch(() => false);

      if (exists) {
        logger.info(`Repository already cloned: ${this.backendId}`, { path: this.repoPath });
        this.addLog('info', 'Repository already exists', { path: this.repoPath });

        // Check if it's a valid git repo
        const git = simpleGit(this.repoPath);
        const isRepo = await git.checkIsRepo();

        if (!isRepo) {
          logger.warn(`Directory exists but is not a git repo, removing: ${this.repoPath}`);
          await fs.rm(this.repoPath, { recursive: true, force: true });
        } else {
          // Pull latest changes if specified
          if (install.pull !== false) {
            logger.info(`Pulling latest changes for ${this.backendId}`);
            this.addLog('info', 'Pulling latest changes');
            await git.pull();
          }
          return;
        }
      }

      // Clone repo
      logger.info(`Cloning repository: ${install.repository}`, {
        branch: install.branch || 'main',
        path: this.repoPath
      });
      this.addLog('info', 'Cloning repository', { repo: install.repository });

      await fs.mkdir(path.dirname(this.repoPath), { recursive: true });

      const git = simpleGit();
      await git.clone(install.repository, this.repoPath, [
        '--branch', install.branch || 'main',
        '--depth', '1'
      ]);

      logger.info(`Repository cloned successfully: ${this.backendId}`);
      this.addLog('info', 'Repository cloned successfully');
    } catch (error) {
      logger.error(`Failed to clone repository ${this.backendId}`, {
        error: error.message,
        repo: install.repository
      });
      throw error;
    }
  }

  /**
   * Run build steps
   */
  async runBuildSteps() {
    const { install } = this.config;

    if (!install.build?.steps || install.build.steps.length === 0) {
      logger.debug(`No build steps defined for ${this.backendId}`);
      return;
    }

    // Check if already built
    const buildMarkerPath = path.join(this.repoPath, '.mcp-built');
    const exists = await fs.access(buildMarkerPath).then(() => true).catch(() => false);

    if (exists && !install.rebuild) {
      logger.info(`Backend ${this.backendId} already built, skipping build`);
      this.addLog('info', 'Build skipped (already built)');
      this.isBuilt = true;
      return;
    }

    logger.info(`Running build steps for ${this.backendId}`, {
      steps: install.build.steps.length
    });
    this.addLog('info', 'Running build steps', { count: install.build.steps.length });

    const workDir = install.subdirectory
      ? path.join(this.repoPath, install.subdirectory)
      : this.repoPath;

    for (let i = 0; i < install.build.steps.length; i++) {
      const step = install.build.steps[i];
      logger.info(`Build step ${i + 1}/${install.build.steps.length}: ${step}`);
      this.addLog('info', `Build step ${i + 1}`, { command: step });

      try {
        await this.runCommand(step, workDir);
      } catch (error) {
        logger.error(`Build step ${i + 1} failed: ${step}`, { error: error.message });
        this.addLog('error', `Build step ${i + 1} failed`, { command: step, error: error.message });
        throw error;
      }
    }

    // Mark as built
    await fs.writeFile(buildMarkerPath, new Date().toISOString());
    this.isBuilt = true;

    logger.info(`Build completed successfully for ${this.backendId}`);
    this.addLog('info', 'Build completed successfully');
  }

  /**
   * Run a shell command
   */
  async runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...this.config.runtime?.env
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const message = data.toString();
        stdout += message;
        logger.debug(`[${this.backendId} build] ${message.trim()}`);
      });

      child.stderr.on('data', (data) => {
        const message = data.toString();
        stderr += message;
        logger.debug(`[${this.backendId} build] ${message.trim()}`);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async spawn() {
    if (this.state === 'running' || this.state === 'starting') {
      logger.warn(`Backend ${this.backendId} is already ${this.state}`);
      return;
    }

    this.state = 'starting';
    this.addLog('info', 'Starting backend');

    try {
      // Step 1: Clone repo
      await this.cloneRepo();

      // Step 2: Run build steps
      await this.runBuildSteps();

      // Step 3: Spawn based on type
      const { type, install, runtime } = this.config;

      if (type === 'git-docker') {
        // For git-docker, use Docker backend with local build context
        await this.spawnGitDocker();
      } else {
        // For git-npm and git-python, spawn process directly
        await this.spawnProcess();
      }

      this.startTime = Date.now();
      this.state = 'running';
      this.lastError = null;

      logger.info(`Backend ${this.backendId} started`);
      this.emit('started', this.process?.pid || 'docker');
    } catch (error) {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Failed to spawn backend', { error: error.message });

      logger.error(`Failed to spawn backend ${this.backendId}`, {
        error: error.message,
        stack: error.stack
      });

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Spawn git-npm or git-python process
   */
  async spawnProcess() {
    const { type, install, runtime } = this.config;

    const workDir = install.subdirectory
      ? path.join(this.repoPath, install.subdirectory)
      : this.repoPath;

    let command = runtime.command;
    let args = [];

    // Determine command and args based on type
    if (type === 'git-npm') {
      command = command || 'node';
      const entrypoint = install.build?.entrypoint || 'index.js';
      args = [path.join(workDir, entrypoint)];
    } else if (type === 'git-python') {
      command = command || 'python';
      const entrypoint = install.build?.entrypoint || 'main.py';
      args = [path.join(workDir, entrypoint)];
    }

    // Add runtime args
    if (runtime?.args) {
      args.push(...runtime.args);
    }

    logger.info(`Spawning ${type} process: ${this.backendId}`, {
      command,
      args,
      cwd: workDir
    });
    this.addLog('info', 'Spawning process', { command, args });

    // Build environment
    const env = {
      ...process.env,
      REPO_DIR: this.repoPath,
      ...runtime?.env
    };

    // Spawn process
    this.process = spawn(command, args, {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    const pid = this.process.pid;
    this.addLog('info', 'Process started', { pid });
    logger.info(`Process started for ${this.backendId}`, { pid });

    // Handle stdout
    this.process.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.addLog('stdout', message);
        logger.debug(`[${this.backendId}] stdout: ${message}`);
      }
    });

    // Handle stderr
    this.process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.addLog('stderr', message);
        if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fatal')) {
          logger.error(`[${this.backendId}] stderr: ${message}`);
        } else {
          logger.debug(`[${this.backendId}] stderr: ${message}`);
        }
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      const uptime = Date.now() - this.startTime;
      this.addLog('info', 'Process exited', { code, signal, uptime });

      logger.info(`Backend ${this.backendId} exited`, {
        code,
        signal,
        uptime: `${(uptime / 1000).toFixed(2)}s`
      });

      if (code !== 0 && code !== null) {
        this.state = 'failed';
        this.lastError = `Process exited with code ${code}`;

        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          logger.warn(`Backend ${this.backendId} failed, retrying... (${this.retryCount}/${this.maxRetries})`);
          setTimeout(() => this.spawn(), 2000 * this.retryCount);
        } else {
          logger.error(`Backend ${this.backendId} failed after ${this.maxRetries} retries`);
          this.emit('failed', this.lastError);
        }
      } else {
        this.state = 'stopped';
      }

      this.process = null;
      this.emit('exit', code, signal);
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Process error', { error: error.message });

      logger.error(`Backend ${this.backendId} process error`, {
        error: error.message,
        stack: error.stack
      });

      this.emit('error', error);
    });
  }

  /**
   * Spawn git-docker backend
   */
  async spawnGitDocker() {
    const { install, runtime } = this.config;

    const workDir = install.subdirectory
      ? path.join(this.repoPath, install.subdirectory)
      : this.repoPath;

    // Build Docker image from repo
    logger.info(`Building Docker image for ${this.backendId}`, { context: workDir });
    this.addLog('info', 'Building Docker image', { context: workDir });

    const dockerfilePath = install.dockerfile || 'Dockerfile';
    const buildCommand = `docker build -t mcp-gateway-${this.backendId}:latest -f ${dockerfilePath} .`;

    try {
      await this.runCommand(buildCommand, workDir);
      logger.info(`Docker image built successfully for ${this.backendId}`);
      this.addLog('info', 'Docker image built successfully');
    } catch (error) {
      logger.error(`Failed to build Docker image for ${this.backendId}`, { error: error.message });
      throw error;
    }

    // Create docker backend config
    const dockerConfig = {
      ...this.config,
      type: 'docker',
      install: {
        image: `mcp-gateway-${this.backendId}`,
        tag: 'latest',
        pull: 'never' // Don't pull, we just built it
      }
    };

    // Create and spawn docker backend
    this.dockerBackend = createDockerBackend(this.backendId, dockerConfig);

    // Forward events
    this.dockerBackend.on('started', (containerId) => {
      this.addLog('info', 'Docker container started', { containerId });
      this.emit('started', containerId);
    });

    this.dockerBackend.on('exit', (code, signal) => {
      this.state = this.dockerBackend.state;
      this.emit('exit', code, signal);
    });

    this.dockerBackend.on('error', (error) => {
      this.state = 'failed';
      this.lastError = error.message;
      this.emit('error', error);
    });

    this.dockerBackend.on('log', (entry) => {
      this.addLog(entry.level, entry.message, entry);
    });

    await this.dockerBackend.spawn();
  }

  async kill(signal = 'SIGTERM') {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.addLog('info', 'Stopping backend', { signal });

    logger.info(`Stopping backend ${this.backendId}`, { signal });

    if (this.dockerBackend) {
      await this.dockerBackend.kill(signal);
      this.dockerBackend = null;
    }

    if (this.process) {
      return new Promise((resolve) => {
        const killTimeout = setTimeout(() => {
          if (this.process) {
            logger.warn(`Backend ${this.backendId} did not stop gracefully, force killing`);
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.process.once('exit', () => {
          clearTimeout(killTimeout);
          this.state = 'stopped';
          this.process = null;
          this.addLog('info', 'Backend stopped');
          resolve();
        });

        this.process.kill(signal);
      });
    }

    this.state = 'stopped';
  }

  isRunning() {
    if (this.dockerBackend) {
      return this.dockerBackend.isRunning();
    }
    return this.state === 'running' && this.process !== null;
  }

  async getStatus() {
    if (this.dockerBackend) {
      return await this.dockerBackend.getStatus();
    }

    return {
      backendId: this.backendId,
      state: this.state,
      pid: this.process?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: this.retryCount,
      lastError: this.lastError,
      repository: this.config.install.repository,
      branch: this.config.install.branch || 'main',
      repoPath: this.repoPath,
      isBuilt: this.isBuilt
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  write(data) {
    if (this.dockerBackend) {
      return this.dockerBackend.write(data);
    }

    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }
    this.process.stdin.write(data);
  }

  read(callback) {
    if (this.dockerBackend) {
      return this.dockerBackend.read(callback);
    }

    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }
    this.process.stdout.on('data', callback);
  }
}

export function createGitBackend(backendId, config) {
  return new GitBackend(backendId, config);
}

export default {
  GitBackend,
  createGitBackend
};
