import { Command } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import * as keytar from "keytar";

const KEYCHAIN_SERVICE = "mcp-gateway";
const KEYCHAIN_ACCOUNT = "api-key";

export default class AuthToken extends Command {
  static description = "Display the API key from system keychain";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    const spinner = ora("Retrieving API key...").start();

    try {
      const apiKey = await keytar.getPassword(
        KEYCHAIN_SERVICE,
        KEYCHAIN_ACCOUNT,
      );
      spinner.stop();

      if (!apiKey) {
        this.log(chalk.yellow("No API key found in keychain"));
        this.log(chalk.gray("The gateway generates a key on first start"));
        this.exit(1);
      }

      this.log(chalk.bold("\nAPI Key:"));
      this.log(chalk.cyan(apiKey));
      this.log(
        chalk.gray("\nUse this key in Authorization header: Bearer <key>"),
      );
    } catch (error) {
      spinner.fail(
        chalk.red(`Failed to retrieve API key: ${(error as Error).message}`),
      );
      this.exit(1);
    }
  }
}
