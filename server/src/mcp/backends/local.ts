/**
 * local source — spawn a command against a script/binary already on disk.
 * Subsumes the old `shell` type (use command: "bash" and args: ["script.sh"]).
 */

import { BaseServer, SpawnArgs } from './base.js';
import type { LocalServer as LocalServerConfig } from '../../types/registry.js';

export class LocalServer extends BaseServer {
  declare config: LocalServerConfig;

  async getSpawnArgs(): Promise<SpawnArgs> {
    const { command, args = [], env = {} } = this.config;
    return { command, args, env };
  }
}

export function createLocalServer(serverName: string, config: LocalServerConfig): LocalServer {
  return new LocalServer(serverName, config);
}

export default { LocalServer, createLocalServer };
