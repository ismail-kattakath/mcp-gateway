/**
 * CLI command: mcp db rollback
 * Rollback database to a previous version
 */

import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs/promises";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import chalk from "chalk";

interface MigrationRecord {
  id: number;
  version: number;
  name: string;
  applied_at: number;
}

export default class DbRollback extends Command {
  static description = "Rollback database to a previous version";

  static examples = [
    "<%= config.bin %> <%= command.id %> --to-version 2",
    "<%= config.bin %> <%= command.id %> --database /path/to/gateway.db --to-version 2",
  ];

  static flags = {
    "to-version": Flags.integer({
      description: "Target database version to rollback to",
      required: true,
    }),
    database: Flags.string({
      char: "d",
      description: "Path to database file",
      default: "./gateway.db",
    }),
    force: Flags.boolean({
      char: "f",
      description: "Force rollback without confirmation",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbRollback);

    try {
      const dbPath = path.resolve(flags.database);

      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch {
        this.error(chalk.red(`Database not found at: ${dbPath}`));
      }

      // Open database
      const db = new Database(dbPath);

      // Detect current version
      const currentVersion = this.detectDbVersion(db);
      this.log(chalk.blue(`Current database version: ${currentVersion}`));

      const toVersion = flags["to-version"];

      if (currentVersion === toVersion) {
        this.log(chalk.green("✓ Database is already at target version."));
        db.close();
        return;
      }

      if (currentVersion < toVersion) {
        db.close();
        this.error(
          chalk.red(
            `Cannot rollback forwards from v${currentVersion} to v${toVersion}. Use 'mcp db migrate' instead.`,
          ),
        );
      }

      // Warning about data loss
      this.warn(
        chalk.yellow.bold("⚠️  WARNING: Rollback may cause data loss!"),
      );
      this.warn(
        chalk.yellow(
          `This will rollback the database from v${currentVersion} to v${toVersion}.`,
        ),
      );
      this.warn(chalk.yellow("Make sure you have a backup before proceeding."));

      if (!flags.force) {
        this.log("");
        this.log(chalk.gray("To proceed with rollback, use the --force flag:"));
        this.log(
          chalk.cyan(`  mcp db rollback --to-version ${toVersion} --force`),
        );
        db.close();
        return;
      }

      // Run rollback
      this.log(
        chalk.blue(
          `\nRolling back from v${currentVersion} to v${toVersion}...`,
        ),
      );
      await this.runRollback(db, currentVersion, toVersion);

      db.close();
      this.log(chalk.green.bold("\n✓ Rollback complete!"));
      this.log(
        chalk.gray(
          "Note: Some data may have been lost. Verify your configuration.",
        ),
      );
    } catch (error) {
      const err = error as Error;
      this.error(chalk.red(`Rollback failed: ${err.message}`));
    }
  }

  private detectDbVersion(db: DatabaseType): number {
    try {
      // Check for migrations table
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
        )
        .get();

      if (!result) {
        // No migrations table
        return 0;
      }

      // Get latest migration version
      const latest = db
        .prepare("SELECT version FROM migrations ORDER BY version DESC LIMIT 1")
        .get() as any;
      return latest?.version || 0;
    } catch (error) {
      const err = error as Error;
      this.warn(
        chalk.yellow(
          `Warning: Could not detect database version: ${err.message}`,
        ),
      );
      return 0;
    }
  }

  private async runRollback(
    db: DatabaseType,
    from: number,
    to: number,
  ): Promise<void> {
    // Find rollback scripts directory
    const possiblePaths = [
      path.join(process.cwd(), "server/src/storage/migrations/rollback"),
      path.join(process.cwd(), "dist/migrations/rollback"),
      path.join(__dirname, "../../../server/src/storage/migrations/rollback"),
      path.join(__dirname, "../../migrations/rollback"),
    ];

    let rollbackDir: string | null = null;
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        rollbackDir = p;
        break;
      } catch {
        // Try next path
      }
    }

    if (!rollbackDir) {
      this.warn(
        chalk.yellow(
          "Rollback scripts not found. Will remove migration records only (manual cleanup required).",
        ),
      );
      // Just remove migration records
      this.removeMigrationRecords(db, from, to);
      return;
    }

    this.log(chalk.gray(`Using rollback scripts from: ${rollbackDir}`));

    // Get migrations to rollback (in reverse order)
    const migrations = db
      .prepare(
        "SELECT * FROM migrations WHERE version > ? ORDER BY version DESC",
      )
      .all(to) as MigrationRecord[];

    if (migrations.length === 0) {
      this.log(chalk.yellow("No migrations to rollback."));
      return;
    }

    // Run each rollback script
    for (const migration of migrations) {
      const rollbackFile = `${migration.version}_${migration.name}_rollback.sql`;
      const rollbackPath = path.join(rollbackDir, rollbackFile);

      this.log(
        chalk.gray(`  Rolling back: v${migration.version} - ${migration.name}`),
      );

      try {
        // Check if rollback script exists
        await fs.access(rollbackPath);
        const sql = await fs.readFile(rollbackPath, "utf-8");

        const runInTransaction = db.transaction(() => {
          // Execute rollback SQL
          db.exec(sql);

          // Remove migration record
          db.prepare("DELETE FROM migrations WHERE version = ?").run(
            migration.version,
          );
        });

        runInTransaction();
        this.log(chalk.green(`  ✓ Rolled back: v${migration.version}`));
      } catch {
        this.warn(
          chalk.yellow(
            `  ⚠ Rollback script not found for v${migration.version}, removing record only`,
          ),
        );
        db.prepare("DELETE FROM migrations WHERE version = ?").run(
          migration.version,
        );
      }
    }
  }

  private removeMigrationRecords(
    db: DatabaseType,
    from: number,
    to: number,
  ): void {
    const migrations = db
      .prepare(
        "SELECT * FROM migrations WHERE version > ? ORDER BY version DESC",
      )
      .all(to) as MigrationRecord[];

    for (const migration of migrations) {
      db.prepare("DELETE FROM migrations WHERE version = ?").run(
        migration.version,
      );
      this.log(chalk.gray(`  Removed migration record: v${migration.version}`));
    }
  }
}
