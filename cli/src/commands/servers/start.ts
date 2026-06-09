import { Args } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";

export default class ServersStart extends BaseCommand {
  static description = "Start an MCP server";

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
    const { args } = await this.parse(ServersStart);
    const spinner = ora(`Starting ${args.name}...`).start();

    try {
      await this.client.startServer(args.name);
      spinner.succeed(chalk.green(`Server ${chalk.bold(args.name)} started`));
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
