import { Command } from "@oclif/core";
import chalk from "chalk";

export default class RoleList extends Command {
  static description = "List all available roles and their permissions";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    this.log(chalk.bold("\nAvailable Roles:\n"));

    const roles = [
      {
        name: "ADMIN",
        description: "Full system access including user and role management",
        permissions: [
          "manage:all",
          "manage:server",
          "manage:tool",
          "manage:user",
          "manage:role",
          "manage:setting",
          "manage:apikey",
          "manage:audit",
        ],
      },
      {
        name: "USER",
        description:
          "Standard user with server creation and tool execution rights",
        permissions: [
          "read:server",
          "create:server",
          "update:server:own",
          "delete:server:own",
          "read:tool",
          "write:tool",
          "read:user:own",
          "update:user:own",
          "read:role",
          "read:setting",
          "manage:apikey:own",
          "read:audit:own",
        ],
      },
      {
        name: "READONLY",
        description: "Read-only access to resources",
        permissions: [
          "read:server",
          "read:tool",
          "read:user:own",
          "read:role",
          "read:setting",
          "read:apikey:own",
          "read:audit:own",
        ],
      },
    ];

    for (const role of roles) {
      this.log(chalk.cyan.bold(role.name));
      this.log(chalk.gray(`  ${role.description}`));
      this.log(chalk.gray("  Permissions:"));
      role.permissions.forEach((perm) => {
        this.log(chalk.gray(`    - ${perm}`));
      });
      this.log();
    }

    this.log(
      chalk.yellow(
        "\nNote: Full RBAC functionality requires Epic #17 to be completed",
      ),
    );
  }
}
