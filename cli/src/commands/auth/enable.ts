import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import {
  loadAuthConfig,
  saveAuthConfig,
  getAuthConfigPath,
} from "../../utils/auth-config.js";

export default class AuthEnable extends Command {
  static description =
    "Enable authentication (set disableAuth: false in auth config)";

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
    const { flags } = await this.parse(AuthEnable);
    const spinner = ora("Enabling authentication...").start();

    try {
      const registryPath = resolve(flags.registry);
      const config = loadAuthConfig(registryPath);

      if (!config.disableAuth) {
        spinner.info(chalk.yellow("Authentication already enabled"));
        return;
      }

      config.disableAuth = false;
      saveAuthConfig(config, registryPath);

      spinner.succeed(chalk.green("Authentication enabled"));
      this.log(chalk.gray(`\nConfig file: ${getAuthConfigPath(registryPath)}`));
      this.log(chalk.gray("Restart the gateway for changes to take effect"));
    } catch (error) {
      spinner.fail(
        chalk.red(`Failed to enable auth: ${(error as Error).message}`),
      );
      this.exit(1);
    }
  }
}
