import { Command } from "@oclif/core";
import chalk from "chalk";

export default class LdapList extends Command {
  static description = "List all LDAP providers";

  static aliases = ["ldap:ls"];

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    this.log(
      chalk.yellow(
        "\nLDAP management requires Epic #20 (LDAP Integration) to be completed",
      ),
    );
    this.log(
      chalk.gray(
        "This command will list configured LDAP providers once the feature is implemented.",
      ),
    );
  }
}
