import chalk from "chalk";
import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";

const SERVICE_NAME = "mcp-gateway";

export default class SecretsSet extends BaseCommand {
  static description =
    "Store a secret in the system keychain (requires keytar)";

  static examples = [
    "<%= config.bin %> <%= command.id %> API_KEY sk_test_123456",
    "<%= config.bin %> <%= command.id %> GITHUB_TOKEN ghp_abc123 --service my-service",
  ];

  static flags = {
    service: Flags.string({
      description: "Service name in keychain",
      default: SERVICE_NAME,
    }),
  };

  static args = {
    key: Args.string({
      description: "Secret key (uppercase alphanumeric with underscores)",
      required: true,
    }),
    value: Args.string({
      description: "Secret value",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsSet);

    // Validate key format
    if (!/^[A-Z][A-Z0-9_]*$/.test(args.key)) {
      this.error(
        chalk.red(
          "Invalid key format. Keys must be uppercase alphanumeric with underscores.",
        ),
      );
    }

    try {
      // Dynamic import to avoid bundling keytar
      const keytar = await import("keytar");
      await keytar.setPassword(flags.service, args.key, args.value);

      this.log(chalk.green("✓ Secret stored successfully"));
      this.log(chalk.gray(`  Service: ${flags.service}`));
      this.log(chalk.gray(`  Key: ${args.key}`));
      this.log();
      this.log(chalk.cyan("Usage in registry.json:"));
      this.log(chalk.gray(`  "env": { "MY_VAR": "\${SECRET:${args.key}}" }`));
    } catch (error) {
      if ((error as { code?: string }).code === "MODULE_NOT_FOUND") {
        this.error(
          chalk.red(
            "Keytar not available. Install with: npm install -g keytar",
          ),
        );
      }
      this.error(
        chalk.red(`Failed to store secret: ${(error as Error).message}`),
      );
    }
  }
}
