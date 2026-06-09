import { Command, Flags } from "@oclif/core";
import { ApiClient, ApiClientOptions } from "./api-client.js";

/**
 * Base command class that provides common flags and API client setup.
 * All commands should extend this class to inherit global flags and API client access.
 */
export abstract class BaseCommand extends Command {
  static baseFlags = {
    url: Flags.string({
      description: "Gateway base URL",
      default: "http://localhost:3000",
      env: "MCP_GATEWAY_URL",
    }),
    debug: Flags.boolean({
      description: "Enable debug output",
      default: false,
    }),
    "no-auth": Flags.boolean({
      description: "Disable authentication (for development)",
      default: false,
    }),
  };

  protected client!: ApiClient;

  /**
   * Initialize API client before command execution.
   * This is called automatically by oclif before run().
   */
  async init(): Promise<void> {
    await super.init();

    const { flags } = await this.parse(this.constructor as typeof BaseCommand);
    const options: ApiClientOptions = {
      baseUrl: flags.url,
      debug: flags.debug,
      disableAuth: flags["no-auth"],
    };

    this.client = new ApiClient(options);
  }

  /**
   * Format uptime in human-readable format.
   */
  protected formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Handle errors consistently across all commands.
   */
  protected handleError(
    error: Error,
    spinner?: { fail: (text: string) => void },
  ): never {
    const message = error.message || "Unknown error occurred";

    if (spinner) {
      spinner.fail(message);
    } else {
      this.error(message);
    }

    // oclif's this.error() throws, so this never executes
    // but TypeScript needs the never return type
    return process.exit(1) as never;
  }
}
