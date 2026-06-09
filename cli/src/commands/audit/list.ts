import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import { getApiClient } from "../../utils/api-client.js";

export default class AuditList extends Command {
  static description = "List audit logs with optional filtering";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --user admin --limit 50",
    '<%= config.bin %> <%= command.id %> --action "auth.*" --start "2024-01-01"',
    "<%= config.bin %> <%= command.id %> --resource-type server --result failure",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      default: "./registry.json",
    }),
    user: Flags.string({
      char: "u",
      description: "Filter by user ID",
    }),
    username: Flags.string({
      description: "Filter by username (partial match)",
    }),
    action: Flags.string({
      char: "a",
      description: 'Filter by action type (supports wildcards: "auth.*")',
    }),
    result: Flags.string({
      description: "Filter by action result (success, failure)",
      options: ["success", "failure"],
    }),
    "resource-type": Flags.string({
      description: "Filter by resource type",
    }),
    "resource-id": Flags.string({
      description: "Filter by resource ID",
    }),
    ip: Flags.string({
      description: "Filter by IP address",
    }),
    start: Flags.string({
      description: "Filter by start date (ISO 8601: 2024-01-01)",
    }),
    end: Flags.string({
      description: "Filter by end date (ISO 8601: 2024-12-31)",
    }),
    limit: Flags.integer({
      char: "l",
      description: "Number of results to return",
      default: 100,
    }),
    offset: Flags.integer({
      char: "o",
      description: "Pagination offset",
      default: 0,
    }),
    "sort-by": Flags.string({
      description: "Sort field",
      options: ["timestamp", "action_type", "user_id"],
      default: "timestamp",
    }),
    "sort-order": Flags.string({
      description: "Sort order",
      options: ["asc", "desc"],
      default: "desc",
    }),
    json: Flags.boolean({
      description: "Output as JSON",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditList);
    const spinner = ora("Fetching audit logs...").start();

    try {
      const registryPath = resolve(flags.registry);
      const client = await getApiClient(registryPath);

      // Build query parameters
      const params = new URLSearchParams();

      if (flags.user) params.append("user_id", flags.user);
      if (flags.username) params.append("username", flags.username);
      if (flags.action) params.append("action_type", flags.action);
      if (flags.result) params.append("action_result", flags.result);
      if (flags["resource-type"])
        params.append("resource_type", flags["resource-type"]);
      if (flags["resource-id"])
        params.append("resource_id", flags["resource-id"]);
      if (flags.ip) params.append("ip_address", flags.ip);
      if (flags.start) params.append("start_date", flags.start);
      if (flags.end) params.append("end_date", flags.end);
      params.append("limit", flags.limit.toString());
      params.append("offset", flags.offset.toString());
      params.append("sort_by", flags["sort-by"]);
      params.append("sort_order", flags["sort-order"]);

      const response = await client.get(`/api/audit-logs?${params.toString()}`);

      spinner.stop();

      if (flags.json) {
        this.log(JSON.stringify(response.data, null, 2));
        return;
      }

      const { logs, pagination } = response.data;

      if (logs.length === 0) {
        this.log(chalk.yellow("No audit logs found"));
        return;
      }

      this.log(
        chalk.bold(
          `\nAudit Logs (${pagination.offset + 1}-${pagination.offset + logs.length} of ${pagination.total})\n`,
        ),
      );

      for (const log of logs) {
        const date = new Date(log.timestamp).toISOString();
        const resultColor =
          log.actionResult === "success" ? chalk.green : chalk.red;
        const actionTypeColor = log.actionType.startsWith("auth.")
          ? chalk.cyan
          : chalk.blue;

        this.log(chalk.gray(`[${date}]`));
        this.log(
          `  ${chalk.bold("Action:")} ${actionTypeColor(log.actionType)} ${resultColor(`[${log.actionResult}]`)}`,
        );

        if (log.username) {
          this.log(`  ${chalk.bold("User:")} ${log.username} (${log.userId})`);
        }

        if (log.resourceType) {
          const resourceName = log.resourceName ? ` (${log.resourceName})` : "";
          this.log(
            `  ${chalk.bold("Resource:")} ${log.resourceType}/${log.resourceId}${resourceName}`,
          );
        }

        if (log.ipAddress) {
          this.log(`  ${chalk.bold("IP:")} ${log.ipAddress}`);
        }

        if (log.details) {
          this.log(
            `  ${chalk.bold("Details:")} ${JSON.stringify(log.details)}`,
          );
        }

        this.log("");
      }

      if (pagination.hasMore) {
        const nextOffset = pagination.offset + pagination.limit;
        this.log(
          chalk.gray(
            `\nShowing ${pagination.offset + logs.length} of ${pagination.total} total entries`,
          ),
        );
        this.log(chalk.gray(`Use --offset ${nextOffset} to see more`));
      }
    } catch (error) {
      spinner.fail(
        chalk.red(`Failed to fetch audit logs: ${(error as Error).message}`),
      );
      this.exit(1);
    }
  }
}
