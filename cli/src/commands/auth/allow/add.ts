import { Command, Flags, Args } from "@oclif/core";
import chalk from "chalk";
import { resolve } from "path";
import { loadAuthConfig, saveAuthConfig } from "../../../utils/auth-config.js";

export default class AuthAllowAdd extends Command {
  static description = "Add an IP address or CIDR to the allowlist";

  static examples = [
    "<%= config.bin %> <%= command.id %> 192.168.1.100 --registry ./registry.json",
    "<%= config.bin %> <%= command.id %> 10.0.0.0/24 -r ./registry.json",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      required: true,
    }),
  };

  static args = {
    ip: Args.string({
      description: "IP address or CIDR range",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AuthAllowAdd);

    try {
      const registryPath = resolve(flags.registry);
      const config = loadAuthConfig(registryPath);
      const allowedIPs: string[] = config.allowedIPs || [];

      if (allowedIPs.includes(args.ip)) {
        this.log(chalk.yellow(`${args.ip} already in allowlist`));
      } else {
        allowedIPs.push(args.ip);
        config.allowedIPs = allowedIPs;
        saveAuthConfig(config, registryPath);
        this.log(chalk.green(`Added ${args.ip} to allowlist`));
        this.log(chalk.gray("Restart the gateway for changes to take effect"));
      }
    } catch (error) {
      this.error(chalk.red(`Failed to add IP: ${(error as Error).message}`));
    }
  }
}
