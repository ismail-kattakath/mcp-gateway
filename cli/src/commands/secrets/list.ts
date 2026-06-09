import chalk from "chalk";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";

const SERVICE_NAME = "mcp-gateway";

export default class SecretsList extends BaseCommand {
  static description = "List known secret keys (not values)";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {
    service: Flags.string({
      description: "Service name in keychain",
      default: SERVICE_NAME,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SecretsList);

    this.log(
      chalk.yellow(
        "⚠ Listing secrets is not supported by the system keychain API",
      ),
    );
    this.log();
    this.log(chalk.bold("Known keys:"));
    this.log(chalk.gray("  - API_KEY (Gateway API key)"));
    this.log(chalk.gray("  - STRIPE_SECRET_KEY"));
    this.log(chalk.gray("  - GITHUB_TOKEN"));
    this.log(chalk.gray("  - AWS_SECRET_ACCESS_KEY"));
    this.log();
    this.log(
      chalk.gray(`Use "mcp secrets get <key>" to retrieve a specific secret`),
    );
    this.log(chalk.gray(`Service: ${flags.service}`));
  }
}
