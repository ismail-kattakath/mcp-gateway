import chalk from "chalk";
import ora from "ora";
import { table } from "table";
import { BaseCommand } from "../../base-command.js";

export default class ServersList extends BaseCommand {
  static description = "List all MCP servers";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --url http://localhost:3000",
    "<%= config.bin %> <%= command.id %> --no-auth",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  static aliases = ["servers:ls"];

  async run(): Promise<void> {
    const spinner = ora("Fetching servers...").start();

    try {
      const { servers: serverList } = await this.client.listServers();
      spinner.stop();

      if (Object.keys(serverList).length === 0) {
        this.log(chalk.yellow("No servers configured"));
        return;
      }

      const data = [
        [
          chalk.bold("Name"),
          chalk.bold("State"),
          chalk.bold("PID"),
          chalk.bold("Uptime"),
        ],
        ...Object.values(serverList).map((s) => [
          s.serverName,
          s.state === "running" ? chalk.green(s.state) : chalk.gray(s.state),
          s.pid ? s.pid.toString() : chalk.gray("—"),
          s.uptime ? this.formatUptime(s.uptime) : chalk.gray("—"),
        ]),
      ];

      this.log(table(data));
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
