import chalk from "chalk";
import { BaseCommand } from "../base-command.js";

export default class Health extends BaseCommand {
  static description = "Check gateway health status";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --url http://localhost:3000",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    try {
      const health = await this.client.health();

      this.log(chalk.bold("\nGateway Health:"));
      this.log(
        chalk.cyan("Status:"),
        health.status === "ok" ? chalk.green("OK") : chalk.red("ERROR"),
      );
      this.log(chalk.cyan("Version:"), health.version);
      this.log(chalk.cyan("Uptime:"), this.formatUptime(health.uptime * 1000));

      this.log(chalk.bold("\nServers:"));
      this.log(chalk.cyan("Total:"), health.servers.total);
      this.log(chalk.cyan("Enabled:"), health.servers.enabled);
      this.log(chalk.cyan("Running:"), health.servers.running);

      if (health.servers.list.length > 0) {
        this.log(chalk.cyan("Active:"), health.servers.list.join(", "));
      }
    } catch (error) {
      this.error(
        chalk.red(`Failed to check health: ${(error as Error).message}`),
      );
    }
  }
}
