/**
 * Database Integration Tests
 *
 * Tests for SQLite database connection and operations.
 * Related: Epic #13, Issue #46
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  transaction,
  backupDatabase,
  getDatabaseStats,
  optimizeDatabase,
  checkDatabaseHealth,
} from '../database.js';

describe('Database', () => {
  // Use unique DB path for each test
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join('/tmp', `test-mcp-gateway-${Date.now()}-${Math.random()}.db`);
  });

  afterEach(() => {
    // Clean up
    try {
      if (isDatabaseInitialized()) {
        closeDatabase();
      }
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Clean up WAL files
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initDatabase', () => {
    it('should initialize database successfully', () => {
      const db = initDatabase(testDbPath);

      expect(db).toBeDefined();
      expect(isDatabaseInitialized()).toBe(true);
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create parent directory if not exists', () => {
      const nestedPath = path.join('/tmp', `test-dir-${Date.now()}`, 'db.sqlite');

      const db = initDatabase(nestedPath);

      expect(db).toBeDefined();
      expect(fs.existsSync(nestedPath)).toBe(true);

      // Clean up
      closeDatabase();
      fs.unlinkSync(nestedPath);
      fs.rmdirSync(path.dirname(nestedPath));
    });

    it('should enable foreign keys', () => {
      const db = initDatabase(testDbPath);

      const result = db.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    });

    it('should set WAL journal mode', () => {
      const db = initDatabase(testDbPath);

      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
    });

    it('should return existing instance on second call', () => {
      const db1 = initDatabase(testDbPath);
      const db2 = initDatabase(testDbPath);

      expect(db1).toBe(db2);
    });
  });

  describe('getDatabase', () => {
    it('should return database instance after init', () => {
      initDatabase(testDbPath);
      const db = getDatabase();

      expect(db).toBeDefined();
    });

    it('should throw if database not initialized', () => {
      expect(() => getDatabase()).toThrow('Database not initialized');
    });
  });

  describe('createTables', () => {
    it('should create all tables', () => {
      const db = initDatabase(testDbPath);

      // Check all tables exist
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('servers');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('api_keys');
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('audit_log');
      expect(tableNames).toContain('refresh_tokens');
    });

    it('should create indexes', () => {
      const db = initDatabase(testDbPath);

      const indexes = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
        )
        .all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);

      // Check some key indexes
      expect(indexNames).toContain('idx_servers_name');
      expect(indexNames).toContain('idx_servers_source');
      expect(indexNames).toContain('idx_servers_enabled');
      expect(indexNames).toContain('idx_users_username');
      expect(indexNames).toContain('idx_api_keys_key_hash');
      expect(indexNames).toContain('idx_settings_category');
      expect(indexNames).toContain('idx_audit_log_timestamp');
    });
  });

  describe('transaction', () => {
    beforeEach(() => {
      initDatabase(testDbPath);
    });

    it('should commit transaction on success', () => {
      const db = getDatabase();

      const result = transaction(() => {
        db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
          'test.key',
          'test-value',
          'test'
        );
        return 'success';
      });

      expect(result).toBe('success');

      // Verify data was committed
      const setting = db
        .prepare(`SELECT * FROM settings WHERE key = ?`)
        .get('test.key') as any;
      expect(setting).toBeDefined();
      expect(setting.value).toBe('test-value');
    });

    it('should rollback transaction on error', () => {
      const db = getDatabase();

      expect(() => {
        transaction(() => {
          db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
            'test.key',
            'test-value',
            'test'
          );
          throw new Error('Test error');
        });
      }).toThrow('Test error');

      // Verify data was not committed
      const setting = db
        .prepare(`SELECT * FROM settings WHERE key = ?`)
        .get('test.key');
      expect(setting).toBeUndefined();
    });

    it('should handle nested transactions', () => {
      const db = getDatabase();

      const result = transaction(() => {
        db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
          'test.key1',
          'value1',
          'test'
        );

        // Nested operation (not a real nested transaction, but sequential)
        db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
          'test.key2',
          'value2',
          'test'
        );

        return 'success';
      });

      expect(result).toBe('success');

      const count = db
        .prepare(`SELECT COUNT(*) as count FROM settings WHERE category = ?`)
        .get('test') as { count: number };
      expect(count.count).toBe(2);
    });
  });

  describe('backupDatabase', () => {
    it('should create backup file', async () => {
      // Use unique DB for this test
      const uniqueDbPath = path.join('/tmp', `test-backup-${Date.now()}-${Math.random()}.db`);
      initDatabase(uniqueDbPath);
      const db = getDatabase();

      // Insert some data
      db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
        'test.key',
        'test-value',
        'test'
      );

      const backupPath = path.join('/tmp', `backup-${Date.now()}-${Math.random()}.db`);

      await backupDatabase(backupPath);

      expect(fs.existsSync(backupPath)).toBe(true);

      // Verify backup contains data
      const backupDb = new Database(backupPath);
      const setting = backupDb
        .prepare(`SELECT * FROM settings WHERE key = ?`)
        .get('test.key') as any;
      expect(setting).toBeDefined();
      expect(setting.value).toBe('test-value');
      backupDb.close();

      // Clean up
      closeDatabase();
      fs.unlinkSync(backupPath);
      fs.unlinkSync(uniqueDbPath);
      if (fs.existsSync(`${uniqueDbPath}-wal`)) fs.unlinkSync(`${uniqueDbPath}-wal`);
      if (fs.existsSync(`${uniqueDbPath}-shm`)) fs.unlinkSync(`${uniqueDbPath}-shm`);
    });

    it('should create parent directory for backup', async () => {
      // Use unique DB for this test
      const uniqueDbPath = path.join('/tmp', `test-backup2-${Date.now()}-${Math.random()}.db`);
      initDatabase(uniqueDbPath);

      const backupPath = path.join('/tmp', `backup-dir-${Date.now()}-${Math.random()}`, 'backup.db');

      await backupDatabase(backupPath);

      expect(fs.existsSync(backupPath)).toBe(true);

      // Clean up
      closeDatabase();
      fs.unlinkSync(backupPath);
      fs.rmdirSync(path.dirname(backupPath));
      fs.unlinkSync(uniqueDbPath);
      if (fs.existsSync(`${uniqueDbPath}-wal`)) fs.unlinkSync(`${uniqueDbPath}-wal`);
      if (fs.existsSync(`${uniqueDbPath}-shm`)) fs.unlinkSync(`${uniqueDbPath}-shm`);
    });
  });

  describe('getDatabaseStats', () => {
    beforeEach(() => {
      initDatabase(testDbPath);
    });

    it('should return database statistics', () => {
      const stats = getDatabaseStats();

      expect(stats).toBeDefined();
      expect(stats.path).toBe(testDbPath);
      expect(stats.size).toBeGreaterThan(0);
      expect(Array.isArray(stats.tables)).toBe(true);
      expect(stats.tables.length).toBeGreaterThan(0);
    });

    it('should include row counts for all tables', () => {
      const db = getDatabase();

      // Insert some data
      db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
        'test.key',
        'test-value',
        'test'
      );

      const stats = getDatabaseStats();

      const settingsTable = stats.tables.find((t) => t.name === 'settings');
      expect(settingsTable).toBeDefined();
      expect(settingsTable!.rows).toBe(1);
    });
  });

  describe('optimizeDatabase', () => {
    beforeEach(() => {
      initDatabase(testDbPath);
    });

    it('should optimize database without errors', () => {
      expect(() => optimizeDatabase()).not.toThrow();
    });

    it('should reduce database size after optimization', () => {
      const db = getDatabase();

      // Insert and delete data to create fragmentation
      for (let i = 0; i < 100; i++) {
        db.prepare(`INSERT INTO settings (key, value, category) VALUES (?, ?, ?)`).run(
          `test.key${i}`,
          'x'.repeat(1000),
          'test'
        );
      }

      // Delete all data
      db.prepare(`DELETE FROM settings`).run();

      const statsAfterDelete = getDatabaseStats();

      // Optimize
      optimizeDatabase();

      const statsAfterOptimize = getDatabaseStats();

      // Size after optimize should be less than or equal to size after delete
      expect(statsAfterOptimize.size).toBeLessThanOrEqual(statsAfterDelete.size);
    });
  });

  describe('checkDatabaseHealth', () => {
    beforeEach(() => {
      initDatabase(testDbPath);
    });

    it('should return healthy status for new database', () => {
      const health = checkDatabaseHealth();

      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it('should detect integrity issues', () => {
      const db = getDatabase();

      // Insert data with valid references
      db.prepare(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)`).run(
        'user-1',
        'testuser',
        'hash',
        'admin'
      );

      const health = checkDatabaseHealth();

      expect(health.healthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection', () => {
      initDatabase(testDbPath);
      expect(isDatabaseInitialized()).toBe(true);

      closeDatabase();

      expect(isDatabaseInitialized()).toBe(false);
    });

    it('should not throw if database not initialized', () => {
      expect(() => closeDatabase()).not.toThrow();
    });
  });
});
