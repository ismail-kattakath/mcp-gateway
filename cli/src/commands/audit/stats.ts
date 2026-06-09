import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import { getApiClient } from "../../utils/api-client.js";

export default class AuditStats extends Command {
  static description = "Show audit log statistics and recent activity";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --registry ./registry.json",
    "<%= config.bin %> <%= command.id %> --json",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      default: "./registry.json",
    }),
    json: Flags.boolean({
      description: "Output as JSON",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditStats);
    const spinner = ora("Fetching audit log statistics...").start();

    try {
      const registryPath = resolve(flags.registry);
      const client = await getApiClient(registryPath);

      const response = await client.get("/api/audit-logs/stats");

      spinner.stop();

      if (flags.json) {
        this.log(JSON.stringify(response.data, null, 2));
        return;
      }

      const {
        totalEntries,
        entriesByAction,
        entriesByResult,
        entriesByUser,
        failedLogins,
        recentActivity,
      } = response.data;

      this.log(chalk.bold("\nAudit Log Statistics\n"));

      // Overview
      this.log(chalk.cyan("Overview:"));
      this.log(`  Total entries: ${chalk.bold(totalEntries.toLocaleString())}`);
      this.log(`  Failed logins: ${chalk.bold(failedLogins.toLocaleString())}`);
      this.log("");

      // By result
      this.log(chalk.cyan("By Result:"));
      for (const [result, count] of Object.entries(entriesByResult)) {
        const color = result === "success" ? chalk.green : chalk.red;
        this.log(`  ${color(result)}: ${count}`);
      }
      this.log("");

      // Top action types
      this.log(chalk.cyan("Top Action Types:"));
      const sortedActions = Object.entries(
        entriesByAction as Record<string, number>,
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      for (const [action, count] of sortedActions) {
        this.log(`  ${chalk.yellow(action)}: ${count}`);
      }
      this.log("");

      // Top users
      if (entriesByUser.length > 0) {
        this.log(chalk.cyan("Top Users:"));
        for (const user of entriesByUser.slice(0, 10)) {
          this.log(
            `  ${chalk.magenta(user.username || user.userId)}: ${user.count}`,
          );
        }
        this.log("");
      }

      // Recent activity
      if (recentActivity.length > 0) {
        this.log(chalk.cyan("Recent Activity (last 10):"));
        for (const log of recentActivity.slice(0, 10)) {
          const date = new Date(log.timestamp).toLocaleTimeString();
          const resultColor =
            log.actionResult === "success" ? chalk.green : chalk.red;
          const user = log.username || log.userId || "system";
          this.log(
            `  ${chalk.gray(`[${date}]`)} ${chalk.yellow(user)} → ${log.actionType} ${resultColor(`[${log.actionResult}]`)}`,
          );
        }
        this.log("");
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          `Failed to fetch audit log statistics: ${(error as Error).message}`,
        ),
      );
      this.exit(1);
    }
  }
}
