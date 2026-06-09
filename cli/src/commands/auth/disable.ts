import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import {
  loadAuthConfig,
  saveAuthConfig,
  getAuthConfigPath,
} from "../../utils/auth-config.js";

export default class AuthDisable extends Command {
  static description =
    "Disable authentication (set disableAuth: true in auth config)";

  static examples = [
    "<%= config.bin %> <%= command.id %> --registry ./registry.json",
    "<%= config.bin %> <%= command.id %> -r /path/to/registry.json",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthDisable);
    const spinner = ora("Disabling authentication...").start();

    try {
      const registryPath = resolve(flags.registry);
      const config = loadAuthConfig(registryPath);

      if (config.disableAuth === true) {
        spinner.info(chalk.yellow("Authentication already disabled"));
        return;
      }

      config.disableAuth = true;
      saveAuthConfig(config, registryPath);

      spinner.warn(chalk.yellow("Authentication disabled"));
      this.log(
        chalk.red("\n⚠️  WARNING: This is insecure for production deployments"),
      );
      this.log(
        chalk.gray(
          "Anyone with network access can call APIs without authentication",
        ),
      );
      this.log(chalk.gray(`\nConfig file: ${getAuthConfigPath(registryPath)}`));
      this.log(chalk.gray("Restart the gateway for changes to take effect"));
    } catch (error) {
      spinner.fail(
        chalk.red(`Failed to disable auth: ${(error as Error).message}`),
      );
      this.exit(1);
    }
  }
}
