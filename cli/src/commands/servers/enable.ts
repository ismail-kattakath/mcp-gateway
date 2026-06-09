import { Args } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";

export default class ServersEnable extends BaseCommand {
  static description = "Enable an MCP server";

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
    const { args } = await this.parse(ServersEnable);
    const spinner = ora(`Enabling ${args.name}...`).start();

    try {
      await this.client.enableServer(args.name);
      spinner.succeed(chalk.green(`Server ${chalk.bold(args.name)} enabled`));
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
