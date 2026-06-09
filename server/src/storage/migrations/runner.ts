/**
 * Database Migration Runner
 *
 * Applies incremental schema migrations to the database.
 * Tracks applied migrations in a migrations table.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizePath, sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration record
 */
interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

/**
 * Initialize migrations table
 */
function initMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  logger.debug('Migrations table initialized');
}

/**
 * Get list of applied migrations
 */
function getAppliedMigrations(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY id').all() as {
    name: string;
  }[];

  return rows.map((r) => r.name);
}

/**
 * Get list of available migration files
 */
function getAvailableMigrations(): string[] {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir);

  // Filter for .sql files matching pattern: NNN_name.sql
  const migrations = files.filter((f) => f.match(/^\d{3}_.*\.sql$/)).sort(); // Lexicographic sort works for NNN_ prefix

  logger.debug('Available migrations', { count: migrations.length, migrations });

  return migrations;
}

/**
 * Apply a single migration
 */
function applyMigration(db: Database.Database, migrationName: string): void {
  const migrationPath = path.join(__dirname, migrationName);

  logger.info('Applying migration', { migration: sanitizePath(migrationName) });

  try {
    // Read migration file
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Remove comments (both -- and /* */ style)
    const cleanedSql = sql
      .replace(/--[^\n]*/g, '') // Remove -- comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

    // Split into individual statements
    const statements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Execute each statement
    for (const statement of statements) {
      try {
        db.exec(statement + ';');
      } catch (error) {
        const err = error as Error;
        // Log but don't fail on "already exists" errors
        if (!err.message.includes('already exists') && !err.message.includes('duplicate column')) {
          logger.error('Failed to execute migration statement', {
            error: sanitizeString(err.message),
            statement: statement.substring(0, 200), // First 200 chars
          });
          throw err;
        } else {
          logger.debug('Skipping duplicate schema element', {
            message: sanitizeString(err.message),
          });
        }
      }
    }

    // Record migration as applied
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migrationName);

    logger.info('Migration applied successfully', { migration: sanitizePath(migrationName) });
  } catch (error) {
    const err = error as Error;
    logger.error('Migration failed', {
      migration: sanitizePath(migrationName),
      error: sanitizeString(err.message),
    });
    throw new Error(`Migration ${migrationName} failed: ${err.message}`);
  }
}

/**
 * Run pending migrations
 *
 * @returns Number of migrations applied
 */
export function runMigrations(): number {
  const db = getDatabase();

  logger.info('Checking for pending migrations...');

  try {
    // Initialize migrations table
    initMigrationsTable(db);

    // Get applied and available migrations
    const applied = getAppliedMigrations(db);
    const available = getAvailableMigrations();

    // Find pending migrations
    const pending = available.filter((m) => !applied.includes(m));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return 0;
    }

    logger.info('Found pending migrations', { count: pending.length, migrations: pending });

    // Apply each pending migration in a transaction
    for (const migration of pending) {
      db.transaction(() => {
        applyMigration(db, migration);
      })();
    }

    logger.info('All migrations applied successfully', { count: pending.length });

    return pending.length;
  } catch (error) {
    const err = error as Error;
    logger.error('Migration runner failed', {
      error: sanitizeString(err.message),
    });
    throw err;
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(): {
  applied: string[];
  pending: string[];
  total: number;
} {
  const db = getDatabase();

  try {
    initMigrationsTable(db);

    const applied = getAppliedMigrations(db);
    const available = getAvailableMigrations();
    const pending = available.filter((m) => !applied.includes(m));

    return {
      applied,
      pending,
      total: available.length,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get migration status', {
      error: sanitizeString(err.message),
    });
    throw err;
  }
}

/**
 * Rollback last migration (dangerous, use with caution)
 *
 * Note: This doesn't actually undo the migration (SQLite doesn't support that easily).
 * It just removes the migration record, allowing it to be re-applied.
 */
export function rollbackLastMigration(): void {
  const db = getDatabase();

  logger.warn('Rolling back last migration (dangerous operation)');

  try {
    const lastMigration = db
      .prepare('SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1')
      .get() as MigrationRecord | undefined;

    if (!lastMigration) {
      logger.warn('No migrations to rollback');
      return;
    }

    db.prepare('DELETE FROM schema_migrations WHERE name = ?').run(lastMigration.name);

    logger.warn('Migration rolled back', { migration: lastMigration.name });
    logger.warn('Note: This only removes the migration record, not the schema changes');
  } catch (error) {
    const err = error as Error;
    logger.error('Rollback failed', {
      error: sanitizeString(err.message),
    });
    throw err;
  }
}

export default {
  runMigrations,
  getMigrationStatus,
  rollbackLastMigration,
};
