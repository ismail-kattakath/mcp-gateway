import chalk from "chalk";
import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";

const SERVICE_NAME = "mcp-gateway";

export default class SecretsGet extends BaseCommand {
  static description = "Retrieve a secret from the system keychain";

  static examples = [
    "<%= config.bin %> <%= command.id %> API_KEY",
    "<%= config.bin %> <%= command.id %> GITHUB_TOKEN --reveal",
  ];

  static flags = {
    service: Flags.string({
      description: "Service name in keychain",
      default: SERVICE_NAME,
    }),
    reveal: Flags.boolean({
      description: "Show the full secret value (default: masked)",
      default: false,
    }),
  };

  static args = {
    key: Args.string({
      description: "Secret key",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsGet);

    try {
      // Dynamic import to avoid bundling keytar
      const keytar = await import("keytar");
      const value = await keytar.getPassword(flags.service, args.key);

      if (value === null) {
        this.error(chalk.yellow(`Secret not found: ${args.key}`));
      }

      this.log(chalk.green("✓ Secret retrieved"));
      this.log(chalk.gray(`  Service: ${flags.service}`));
      this.log(chalk.gray(`  Key: ${args.key}`));

      if (flags.reveal) {
        this.log(chalk.gray(`  Value: ${value}`));
        this.log();
        this.log(
          chalk.yellow(
            "⚠ Secret value revealed. Ensure your terminal is secure.",
          ),
        );
      } else {
        // Mask the value (show first 4 and last 4 chars)
        const masked =
          value.length > 8
            ? `${value.substring(0, 4)}${"*".repeat(value.length - 8)}${value.substring(value.length - 4)}`
            : "*".repeat(value.length);
        this.log(chalk.gray(`  Value: ${masked}`));
        this.log();
        this.log(chalk.gray("Use --reveal to show the full value"));
      }
    } catch (error) {
      if ((error as { code?: string }).code === "MODULE_NOT_FOUND") {
        this.error(
          chalk.red(
            "Keytar not available. Install with: npm install -g keytar",
          ),
        );
      }
      this.error(
        chalk.red(`Failed to retrieve secret: ${(error as Error).message}`),
      );
    }
  }
}
