/**
 * pkg source — run a package manager binary (npx, uvx, pipx, …).
 * Schema-side, command + args + env are explicit. We just spawn them.
 */

import { BaseServer, SpawnArgs } from './base.js';
import type { PkgServer as PkgServerConfig } from '../../types/registry.js';

export class PkgServer extends BaseServer {
  declare config: PkgServerConfig;

  async getSpawnArgs(): Promise<SpawnArgs> {
    const { command, args, env = {} } = this.config;
    return { command, args, env };
  }
}

export function createPkgServer(serverName: string, config: PkgServerConfig): PkgServer {
  return new PkgServer(serverName, config);
}

export default { PkgServer, createPkgServer };
