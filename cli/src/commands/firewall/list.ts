import { Command } from "@oclif/core";
import chalk from "chalk";

export default class FirewallList extends Command {
  static description = "List all firewall rules";

  static aliases = ["firewall:ls"];

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    this.log(
      chalk.yellow(
        "\nFirewall management requires Epic #23 (Network Security) to be completed",
      ),
    );
    this.log(
      chalk.gray(
        "This command will list IP filtering rules once the feature is implemented.",
      ),
    );
  }
}
