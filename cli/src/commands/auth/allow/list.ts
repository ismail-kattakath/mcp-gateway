import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import { resolve } from "path";
import { loadAuthConfig } from "../../../utils/auth-config.js";

export default class AuthAllowList extends Command {
  static description = "List IP addresses in the allowlist";

  static examples = [
    "<%= config.bin %> <%= command.id %> --registry ./registry.json",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthAllowList);

    try {
      const registryPath = resolve(flags.registry);
      const config = loadAuthConfig(registryPath);
      const allowedIPs: string[] = config.allowedIPs || [];

      if (allowedIPs.length === 0) {
        this.log(chalk.yellow("No IP allowlist configured (all IPs allowed)"));
      } else {
        this.log(chalk.bold("Allowed IPs:"));
        allowedIPs.forEach((ip) => this.log(chalk.cyan(`  • ${ip}`)));
      }
    } catch (error) {
      this.error(chalk.red(`Failed to list IPs: ${(error as Error).message}`));
    }
  }
}
