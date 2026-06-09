/**
 * CLI command: mcp db migrate
 * Migrate database to a specific version
 */

import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs/promises";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import chalk from "chalk";

interface Migration {
  version: number;
  name: string;
  file: string;
}

export default class DbMigrate extends Command {
  static description = "Migrate database to a specific version";

  static examples = [
    "<%= config.bin %> <%= command.id %> --to-version 3",
    "<%= config.bin %> <%= command.id %> --from-version 2 --to-version 3",
    "<%= config.bin %> <%= command.id %> --database /path/to/gateway.db --to-version 3",
  ];

  static flags = {
    "from-version": Flags.integer({
      description: "Source database version (auto-detected if omitted)",
    }),
    "to-version": Flags.integer({
      description: "Target database version",
      required: true,
    }),
    database: Flags.string({
      char: "d",
      description: "Path to database file",
      default: "./gateway.db",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbMigrate);

    try {
      const dbPath = path.resolve(flags.database);

      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch {
        this.log(chalk.yellow(`Database not found at: ${dbPath}`));
        this.log(chalk.gray("No migration needed for new installations."));
        return;
      }

      // Open database
      const db = new Database(dbPath);

      // Detect current version
      const currentVersion = this.detectDbVersion(db);
      this.log(chalk.blue(`Current database version: ${currentVersion}`));

      const fromVersion = flags["from-version"] ?? currentVersion;
      const toVersion = flags["to-version"];

      if (fromVersion === toVersion) {
        this.log(chalk.green("✓ Database is already at target version."));
        db.close();
        return;
      }

      if (fromVersion > toVersion) {
        db.close();
        this.error(
          chalk.red(
            `Cannot migrate backwards from v${fromVersion} to v${toVersion}. Use 'mcp db rollback' instead.`,
          ),
        );
      }

      // Run migrations
      this.log(
        chalk.blue(`Migrating from v${fromVersion} to v${toVersion}...`),
      );
      await this.runMigrations(db, fromVersion, toVersion);

      db.close();
      this.log(chalk.green.bold("\n✓ Migration complete!"));
    } catch (error) {
      const err = error as Error;
      this.error(chalk.red(`Migration failed: ${err.message}`));
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
        // No migrations table = v0 (pre-v3, need to check for v2 tables)
        const auditLogTable = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'",
          )
          .get();
        return auditLogTable ? 2 : 0;
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

  private async runMigrations(
    db: DatabaseType,
    from: number,
    to: number,
  ): Promise<void> {
    // Find migrations directory
    // In built package, migrations are in dist/migrations
    // In dev mode, they're in server/src/storage/migrations
    const possiblePaths = [
      path.join(process.cwd(), "server/src/storage/migrations"),
      path.join(process.cwd(), "dist/migrations"),
      path.join(__dirname, "../../../server/src/storage/migrations"),
      path.join(__dirname, "../../migrations"),
    ];

    let migrationsDir: string | null = null;
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        migrationsDir = p;
        break;
      } catch {
        // Try next path
      }
    }

    if (!migrationsDir) {
      throw new Error("Migrations directory not found");
    }

    this.log(chalk.gray(`Using migrations from: ${migrationsDir}`));

    // Load migration files
    const files = await fs.readdir(migrationsDir);

    // Sort and filter migrations
    const migrations: Migration[] = files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => {
        const match = f.match(/^(\d+)_(.+)\.sql$/);
        if (!match) return null;
        return { version: parseInt(match[1]), name: match[2], file: f };
      })
      .filter((m): m is Migration => m !== null)
      .filter((m) => m.version > from && m.version <= to)
      .sort((a, b) => a.version - b.version);

    if (migrations.length === 0) {
      this.log(chalk.yellow("No migrations to run."));
      return;
    }

    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);

    // Run each migration in a transaction
    for (const migration of migrations) {
      this.log(chalk.gray(`  Running migration: ${migration.file}`));
      const sql = await fs.readFile(
        path.join(migrationsDir, migration.file),
        "utf-8",
      );

      const runInTransaction = db.transaction(() => {
        // Execute migration SQL
        db.exec(sql);

        // Record migration
        db.prepare(
          "INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.version, migration.name, Date.now());
      });

      runInTransaction();
      this.log(
        chalk.green(`  ✓ Completed: v${migration.version} - ${migration.name}`),
      );
    }
  }
}
