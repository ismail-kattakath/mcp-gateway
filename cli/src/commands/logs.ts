import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../base-command.js";
import { LogEntry } from "../api-client.js";

export default class Logs extends BaseCommand {
  static description = "View MCP server logs";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> filesystem",
    "<%= config.bin %> <%= command.id %> filesystem --tail 50",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    tail: Flags.integer({
      char: "n",
      description: "Number of lines to show",
      default: 100,
    }),
    follow: Flags.boolean({
      char: "f",
      description: "Follow log output (not yet implemented)",
      default: false,
    }),
  };

  static args = {
    server: Args.string({
      description: "Server name (optional, shows all if omitted)",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Logs);

    if (flags.follow) {
      this.log(chalk.yellow("⚠️  Follow mode not yet implemented"));
      return;
    }

    const spinner = ora("Fetching logs...").start();

    try {
      const result = await this.client.getLogs(args.server, flags.tail);
      spinner.stop();

      if (args.server) {
        // Single server logs
        const entries = result.logs || [];
        if (entries.length === 0) {
          this.log(chalk.yellow(`No logs found for ${args.server}`));
          return;
        }

        this.log(
          chalk.bold(`\nLogs for ${args.server} (last ${entries.length}):\n`),
        );
        entries.forEach((entry) => this.formatLogEntry(entry));
      } else {
        // All servers logs
        const servers = result.servers || {};
        const serverNames = Object.keys(servers);

        if (serverNames.length === 0) {
          this.log(chalk.yellow("No logs available"));
          return;
        }

        for (const name of serverNames) {
          const entries = servers[name];
          this.log(chalk.bold(`\n${name} (${entries.length} entries):`));
          entries.forEach((entry) => this.formatLogEntry(entry));
        }
      }
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }

  private formatLogEntry(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    let levelColor = chalk.white;

    switch (entry.level) {
      case "error":
        levelColor = chalk.red;
        break;
      case "warn":
        levelColor = chalk.yellow;
        break;
      case "info":
        levelColor = chalk.cyan;
        break;
      case "debug":
        levelColor = chalk.gray;
        break;
    }

    const stream =
      entry.stream === "stderr"
        ? chalk.red("[stderr]")
        : chalk.gray("[stdout]");
    this.log(
      `${chalk.gray(timestamp)} ${levelColor(entry.level.toUpperCase().padEnd(5))} ${stream} ${entry.message}`,
    );
  }
}
