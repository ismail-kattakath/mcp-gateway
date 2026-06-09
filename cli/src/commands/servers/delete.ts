import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";

export default class ServersDelete extends BaseCommand {
  static description = "Delete an MCP server";

  static examples = [
    "<%= config.bin %> <%= command.id %> filesystem --force",
    "<%= config.bin %> <%= command.id %> obs-mcp -f",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: "f",
      description: "Skip confirmation",
      default: false,
    }),
  };

  static args = {
    name: Args.string({
      description: "Server name",
      required: true,
    }),
  };

  static aliases = ["servers:rm"];

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ServersDelete);

    if (!flags.force) {
      this.log(
        chalk.yellow(
          `⚠️  Are you sure you want to delete ${chalk.bold(args.name)}?`,
        ),
      );
      this.log(chalk.gray("Run with --force to skip confirmation"));
      this.exit(1);
    }

    const spinner = ora(`Deleting ${args.name}...`).start();

    try {
      await this.client.deleteServer(args.name);
      spinner.succeed(chalk.green(`Server ${chalk.bold(args.name)} deleted`));
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
