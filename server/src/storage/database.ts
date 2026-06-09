/**
 * SQLite Database Integration
 *
 * Manages SQLite connection, initialization, and transaction support.
 * Uses better-sqlite3 for synchronous SQLite operations.
 *
 * Related: Epic #13, Issue #46
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logging/logger.js';
import { sanitizePath, sanitizeString } from '../logging/sanitizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default database path
const DEFAULT_DB_PATH = path.resolve(process.env.HOME || '/tmp', '.mcp/gateway.db');

/**
 * Database instance singleton
 */
let db: Database.Database | null = null;
let actualDbPath: string | null = null;

/**
 * Get the database file path from environment or use default
 */
export function getDatabasePath(): string {
  return process.env.MCP_GATEWAY_DB_PATH || DEFAULT_DB_PATH;
}

/**
 * Initialize the database connection and create tables
 *
 * @param dbPath - Path to SQLite database file (optional)
 * @returns Database instance
 * @throws {Error} If initialization fails
 */
export function initDatabase(dbPath?: string): Database.Database {
  if (db) {
    logger.debug('Database already initialized, returning existing connection');
    return db;
  }

  const finalPath = dbPath || getDatabasePath();
  actualDbPath = finalPath;

  try {
    // Ensure parent directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      logger.info(`Creating database directory: ${sanitizePath(dir)}`);
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database connection
    logger.info(`Initializing database at: ${sanitizePath(finalPath)}`);

    db = new Database(finalPath, {
      verbose: process.env.LOG_LEVEL === 'debug' ? (msg) => logger.debug(msg) : undefined,
    });

    // Enable foreign keys (disabled by default in SQLite)
    db.pragma('foreign_keys = ON');

    // Set journal mode to WAL for better concurrency
    db.pragma('journal_mode = WAL');

    // Set synchronous mode to NORMAL (good balance of safety and performance)
    db.pragma('synchronous = NORMAL');

    // Set cache size to 10MB (better for read-heavy workloads)
    db.pragma('cache_size = -10000');

    logger.info('Database connection established');

    // Create tables if they don't exist
    createTables();

    logger.info('Database initialization complete');

    return db;
  } catch (error) {
    const err = error as Error;
    logger.error('Database initialization failed', {
      error: sanitizeString(err.message),
      path: sanitizePath(finalPath),
    });
    throw new Error(`Failed to initialize database: ${err.message}`);
  }
}

/**
 * Get the current database instance
 *
 * @throws {Error} If database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Create all tables from schema.sql
 */
function createTables(): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  logger.info('Creating database tables...');

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove comments (both -- and /* */ style)
    const cleanedSchema = schema
      .replace(/--[^\n]*/g, '') // Remove -- comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

    // Split into individual statements by semicolons
    // This is a simple split that works for our schema (no ; inside strings)
    const statements = cleanedSchema
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
        if (!err.message.includes('already exists')) {
          logger.warn('Failed to execute schema statement', {
            error: sanitizeString(err.message),
            statement: statement.substring(0, 100), // First 100 chars
          });
        }
      }
    }

    logger.info('Database tables created successfully');
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create tables', {
      error: sanitizeString(err.message),
    });
    throw new Error(`Failed to create tables: ${err.message}`);
  }
}

/**
 * Execute a callback within a transaction
 *
 * @param callback - Function to execute within transaction
 * @returns Result of callback
 * @throws {Error} If transaction fails
 */
export function transaction<T>(callback: () => T): T {
  const database = getDatabase();

  logger.debug('Starting transaction');

  try {
    // Begin transaction
    database.prepare('BEGIN').run();

    // Execute callback
    const result = callback();

    // Commit transaction
    database.prepare('COMMIT').run();

    logger.debug('Transaction committed');

    return result;
  } catch (error) {
    // Rollback on error
    try {
      database.prepare('ROLLBACK').run();
      logger.debug('Transaction rolled back');
    } catch (rollbackError) {
      const rbErr = rollbackError as Error;
      logger.error('Failed to rollback transaction', {
        error: sanitizeString(rbErr.message),
      });
    }

    const err = error as Error;
    logger.error('Transaction failed', {
      error: sanitizeString(err.message),
    });

    throw error;
  }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    logger.info('Closing database connection');
    try {
      db.close();
      db = null;
      actualDbPath = null;
      logger.info('Database connection closed');
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to close database', {
        error: sanitizeString(err.message),
      });
    }
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}

/**
 * Backup database to a file
 *
 * @param backupPath - Path to backup file
 * @throws {Error} If backup fails
 */
export async function backupDatabase(backupPath: string): Promise<void> {
  const database = getDatabase();

  logger.info(`Creating database backup: ${sanitizePath(backupPath)}`);

  try {
    // Ensure parent directory exists
    const dir = path.dirname(backupPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Use SQLite backup API (async)
    await database.backup(backupPath);

    logger.info('Database backup complete', {
      path: sanitizePath(backupPath),
      size: fs.statSync(backupPath).size,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Database backup failed', {
      error: sanitizeString(err.message),
      path: sanitizePath(backupPath),
    });
    throw new Error(`Failed to backup database: ${err.message}`);
  }
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  path: string;
  size: number;
  tables: { name: string; rows: number }[];
} {
  const database = getDatabase();
  const dbPath = actualDbPath || getDatabasePath();

  // Get database file size
  const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  // Get table row counts
  const tables = database
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];

  const tableStats = tables.map((table) => {
    const result = database.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as {
      count: number;
    };

    return {
      name: table.name,
      rows: result.count,
    };
  });

  return {
    path: dbPath,
    size,
    tables: tableStats,
  };
}

/**
 * Optimize database (vacuum and analyze)
 */
export function optimizeDatabase(): void {
  const database = getDatabase();

  logger.info('Optimizing database...');

  try {
    // Vacuum to reclaim space
    database.exec('VACUUM');

    // Analyze for query optimization
    database.exec('ANALYZE');

    logger.info('Database optimization complete');
  } catch (error) {
    const err = error as Error;
    logger.error('Database optimization failed', {
      error: sanitizeString(err.message),
    });
    throw new Error(`Failed to optimize database: ${err.message}`);
  }
}

/**
 * Check database health
 */
export function checkDatabaseHealth(): {
  healthy: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  try {
    const database = getDatabase();

    // Check integrity
    const result = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };

    if (result.integrity_check !== 'ok') {
      issues.push(`Integrity check failed: ${result.integrity_check}`);
    }

    // Check foreign keys
    const fkResult = database.prepare('PRAGMA foreign_key_check').all();
    if (fkResult.length > 0) {
      issues.push(`Foreign key violations detected: ${fkResult.length}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  } catch (error) {
    const err = error as Error;
    issues.push(`Health check failed: ${err.message}`);
    return {
      healthy: false,
      issues,
    };
  }
}

export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDatabasePath,
  transaction,
  backupDatabase,
  getDatabaseStats,
  optimizeDatabase,
  checkDatabaseHealth,
};
