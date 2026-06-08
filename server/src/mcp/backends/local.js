/**
 * local source — spawn a command against a script/binary already on disk.
 * Subsumes the old `shell` type (use command: "bash" and args: ["script.sh"]).
 */

import { BaseServer } from './base.js';

export class LocalServer extends BaseServer {
  async getSpawnArgs() {
    const { command, args = [], env = {} } = this.config;
    return { command, args, env };
  }
}

export function createLocalServer(serverName, config) {
  return new LocalServer(serverName, config);
}

export default { LocalServer, createLocalServer };
