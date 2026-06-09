import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { getApiClient } from "../../utils/api-client.js";

export default class AuditExport extends Command {
  static description = "Export audit logs to CSV or JSON";

  static examples = [
    "<%= config.bin %> <%= command.id %> --format csv --output logs.csv",
    '<%= config.bin %> <%= command.id %> --format json --output logs.json --start "2024-01-01"',
    '<%= config.bin %> <%= command.id %> --format csv --action "auth.*" --result failure',
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      default: "./registry.json",
    }),
    format: Flags.string({
      char: "f",
      description: "Export format",
      options: ["csv", "json"],
      required: true,
    }),
    output: Flags.string({
      char: "o",
      description: "Output file path",
      required: true,
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
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditExport);
    const spinner = ora("Exporting audit logs...").start();

    try {
      const registryPath = resolve(flags.registry);
      const client = await getApiClient(registryPath);

      // Build query parameters
      const params = new URLSearchParams();
      params.append("format", flags.format);

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

      const response = await client.get(
        `/api/audit-logs/export?${params.toString()}`,
        {
          responseType: "text",
        },
      );

      const outputPath = resolve(flags.output);
      writeFileSync(outputPath, response.data, "utf8");

      // Count lines/records for feedback
      let recordCount = 0;
      if (flags.format === "csv") {
        recordCount = response.data.split("\n").length - 1; // Exclude header
      } else {
        try {
          const data = JSON.parse(response.data);
          recordCount = Array.isArray(data) ? data.length : 0;
        } catch {
          recordCount = 0;
        }
      }

      spinner.succeed(
        chalk.green(`Exported ${recordCount} audit logs to ${outputPath}`),
      );
    } catch (error) {
      spinner.fail(
        chalk.red(`Failed to export audit logs: ${(error as Error).message}`),
      );
      this.exit(1);
    }
  }
}
