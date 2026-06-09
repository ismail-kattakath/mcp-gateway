import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";
import { getApiClient } from "../../utils/api-client.js";

export default class AuditVerify extends Command {
  static description = "Verify audit log chain integrity (tamper detection)";

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
    const { flags } = await this.parse(AuditVerify);
    const spinner = ora("Verifying audit log integrity...").start();

    try {
      const registryPath = resolve(flags.registry);
      const client = await getApiClient(registryPath);

      const response = await client.get("/api/audit-logs/verify");

      spinner.stop();

      if (flags.json) {
        this.log(JSON.stringify(response.data, null, 2));
        return;
      }

      const { valid, totalEntries, errorCount, errors } = response.data;

      if (valid) {
        this.log(chalk.green.bold("\n✓ Audit log integrity verified"));
        this.log(chalk.gray(`  Verified ${totalEntries} entries`));
        this.log(chalk.gray("  No tampering detected\n"));
      } else {
        this.log(chalk.red.bold("\n✗ Audit log integrity FAILED"));
        this.log(chalk.gray(`  Total entries: ${totalEntries}`));
        this.log(chalk.red(`  Errors found: ${errorCount}\n`));

        if (errors.length > 0) {
          this.log(chalk.bold("Integrity Errors:\n"));

          for (const error of errors.slice(0, 20)) {
            const date = new Date(error.timestamp).toISOString();
            this.log(chalk.yellow(`  [${date}] ${error.entryId}`));
            this.log(chalk.red(`    ${error.error}`));
          }

          if (errors.length > 20) {
            this.log(
              chalk.gray(`\n  ... and ${errors.length - 20} more errors`),
            );
          }

          this.log(chalk.yellow("\nWarning: Audit log tampering detected!"));
          this.log(chalk.gray("This may indicate:"));
          this.log(chalk.gray("  - Direct database manipulation"));
          this.log(chalk.gray("  - Deleted log entries"));
          this.log(chalk.gray("  - Out-of-order insertions"));
          this.log(
            chalk.gray(
              "\nInvestigate immediately and review recent access logs.\n",
            ),
          );
        }
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          `Failed to verify audit log integrity: ${(error as Error).message}`,
        ),
      );
      this.exit(1);
    }
  }
}
