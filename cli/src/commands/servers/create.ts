import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { ServerConfig } from "../../api-client.js";

export default class ServersCreate extends BaseCommand {
  static description = "Create a new MCP server";

  static examples = [
    "<%= config.bin %> <%= command.id %> my-server --source pkg --command npx --args @obs-mcp/server",
    "<%= config.bin %> <%= command.id %> my-server --source git --command https://github.com/user/repo.git",
    "<%= config.bin %> <%= command.id %> my-server --source local --command /path/to/script.js --lifecycle persistent",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    source: Flags.string({
      description: "Server source type",
      required: true,
      options: ["pkg", "git", "container", "remote", "local"],
    }),
    command: Flags.string({
      description: "Command to execute",
      required: true,
    }),
    args: Flags.string({
      description: "Command arguments (comma-separated)",
      multiple: true,
    }),
    enabled: Flags.boolean({
      description: "Enable server",
      default: true,
    }),
    lifecycle: Flags.string({
      description: "Server lifecycle mode",
      default: "on-demand",
      options: ["persistent", "on-demand"],
    }),
    timeout: Flags.integer({
      description: "Timeout in milliseconds",
      default: 30000,
    }),
  };

  static args = {
    name: Args.string({
      description: "Server name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ServersCreate);
    const spinner = ora(`Creating server ${args.name}...`).start();

    try {
      const config: ServerConfig = {
        source: flags.source as
          | "pkg"
          | "git"
          | "container"
          | "remote"
          | "local",
        command: flags.command,
        args: flags.args || [],
        enabled: flags.enabled,
        lifecycle: flags.lifecycle as "persistent" | "on-demand",
        timeout: flags.timeout,
      };

      await this.client.createServer(args.name, config);
      spinner.succeed(
        chalk.green(`Server ${chalk.bold(args.name)} created successfully`),
      );
    } catch (error) {
      this.handleError(error as Error, spinner);
    }
  }
}
