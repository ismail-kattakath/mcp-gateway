/**
 * pkg source — run a package manager binary (npx, uvx, pipx, …).
 * Schema-side, command + args + env are explicit. We just spawn them.
 */

import { BaseServer } from './base.js';

export class PkgServer extends BaseServer {
  async getSpawnArgs() {
    const { command, args, env = {} } = this.config;
    return { command, args, env };
  }
}

export function createPkgServer(serverName, config) {
  return new PkgServer(serverName, config);
}

export default { PkgServer, createPkgServer };
