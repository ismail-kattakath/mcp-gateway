import { Args } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";

export default class ServersGet extends BaseCommand {
  static description = "Get details for a specific MCP server";

  static examples = [
    "<%= config.bin %> <%= command.id %> filesystem",
    "<%= config.bin %> <%= command.id %> obs-mcp --url http://localhost:3000",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  static args = {
    name: Args.string({
      description: "Server name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ServersGet);
    const spinner = ora(`Fetching ${args.name}...`).start();

    try {
      const server = await this.client.getServer(args.name);
      spinner.stop();

      this.log(chalk.bold("\nServer Details:"));
      this.log(chalk.cyan("Name:"), server.name);
      this.log(
        chalk.cyan("State:"),
        server.status.state === "running"
          ? chalk.green(server.status.state)
          : chalk.gray(server.status.state),
      );
      this.log(chalk.cyan("PID:"), server.status.pid || chalk.gray("—"));
      this.log(
        chalk.cyan("Uptime:"),
        server.status.uptime
          ? this.formatUptime(server.status.uptime)
          : chalk.gray("—"),
      );

      this.log(chalk.bold("\nConfiguration:"));
      this.log(JSON.stringify(server.config, null, 2));
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
