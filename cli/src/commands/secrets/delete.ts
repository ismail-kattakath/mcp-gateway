import chalk from "chalk";
import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";

const SERVICE_NAME = "mcp-gateway";

export default class SecretsDelete extends BaseCommand {
  static description = "Delete a secret from the system keychain";

  static examples = [
    "<%= config.bin %> <%= command.id %> API_KEY",
    "<%= config.bin %> <%= command.id %> OLD_TOKEN --service my-service",
  ];

  static flags = {
    service: Flags.string({
      description: "Service name in keychain",
      default: SERVICE_NAME,
    }),
  };

  static args = {
    key: Args.string({
      description: "Secret key",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsDelete);

    try {
      // Dynamic import to avoid bundling keytar
      const keytar = await import("keytar");
      await keytar.deletePassword(flags.service, args.key);

      this.log(chalk.green("✓ Secret deleted"));
      this.log(chalk.gray(`  Service: ${flags.service}`));
      this.log(chalk.gray(`  Key: ${args.key}`));
    } catch (error) {
      if ((error as { code?: string }).code === "MODULE_NOT_FOUND") {
        this.error(
          chalk.red(
            "Keytar not available. Install with: npm install -g keytar",
          ),
        );
      }
      this.error(
        chalk.red(`Failed to delete secret: ${(error as Error).message}`),
      );
    }
  }
}
