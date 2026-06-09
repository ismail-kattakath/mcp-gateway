/**
 * Audit Service Tests
 *
 * Tests for audit log creation, querying, integrity verification, and export.
 *
 * Related: Epic #22 (Audit Logging)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../../storage/database.js';
import {
  createAuditLog,
  getAuditLogs,
  verifyAuditLogIntegrity,
  exportAuditLogs,
  getRetentionPolicy,
  purgeExpiredLogs,
} from '../service.js';
import { AuditActionType } from '../../types/audit.js';

describe('Audit Service', () => {
  beforeEach(() => {
    initDatabase(':memory:');

    // Create users table for foreign key constraint
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        tenant TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_login_at TEXT
      )
    `);

    // Create test users
    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES ('user-1', 'alice', 'alice@test.com', 'hash', 'user'),
             ('user-2', 'bob', 'bob@test.com', 'hash', 'user')
    `
    ).run();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('createAuditLog', () => {
    it('should create an audit log entry', async () => {
      const entry = await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.userId).toBe('user-1');
      expect(entry.username).toBe('alice');
      expect(entry.actionType).toBe(AuditActionType.AUTH_LOGIN);
      expect(entry.actionResult).toBe('success');
      expect(entry.entryHash).toBeDefined();
    });

    it('should compute hash chain correctly', async () => {
      const entry1 = await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      const entry2 = await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
        resourceType: 'server',
        resourceId: 'server-1',
      });

      expect(entry1.previousHash).toBeUndefined();
      expect(entry2.previousHash).toBe(entry1.entryHash);
    });

    it('should handle entries without user ID', async () => {
      const entry = await createAuditLog({
        actionType: AuditActionType.SYSTEM_STARTED,
        actionResult: 'success',
      });

      expect(entry.userId).toBeUndefined();
      expect(entry.username).toBeUndefined();
      expect(entry.entryHash).toBeDefined();
    });

    it('should store details as JSON', async () => {
      const details = { reason: 'test', count: 42 };

      const entry = await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.CONFIG_UPDATED,
        actionResult: 'success',
        details,
      });

      expect(entry.details).toEqual(details);
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Create test data
      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
        ipAddress: '127.0.0.1',
      });

      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN_FAILED,
        actionResult: 'failure',
        ipAddress: '127.0.0.1',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
        resourceType: 'server',
        resourceId: 'server-1',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_DELETED,
        actionResult: 'success',
        resourceType: 'server',
        resourceId: 'server-2',
      });
    });

    it('should get all audit logs', async () => {
      const result = await getAuditLogs();

      expect(result.logs).toHaveLength(4);
      expect(result.total).toBe(4);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by user ID', async () => {
      const result = await getAuditLogs({ userId: 'user-1' });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.logs.every((log) => log.userId === 'user-1')).toBe(true);
    });

    it('should filter by username', async () => {
      const result = await getAuditLogs({ username: 'bob' });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.logs.every((log) => log.username === 'bob')).toBe(true);
    });

    it('should filter by action type', async () => {
      const result = await getAuditLogs({ actionType: AuditActionType.AUTH_LOGIN });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].actionType).toBe(AuditActionType.AUTH_LOGIN);
    });

    it('should filter by action type with wildcard', async () => {
      const result = await getAuditLogs({ actionType: 'auth.*' });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.logs.every((log) => log.actionType.startsWith('auth.'))).toBe(true);
    });

    it('should filter by action result', async () => {
      const result = await getAuditLogs({ actionResult: 'failure' });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].actionResult).toBe('failure');
    });

    it('should filter by resource type', async () => {
      const result = await getAuditLogs({ resourceType: 'server' });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.logs.every((log) => log.resourceType === 'server')).toBe(true);
    });

    it('should filter by resource ID', async () => {
      const result = await getAuditLogs({ resourceId: 'server-1' });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].resourceId).toBe('server-1');
    });

    it('should filter by IP address', async () => {
      const result = await getAuditLogs({ ipAddress: '127.0.0.1' });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should support pagination', async () => {
      const result1 = await getAuditLogs({}, { limit: 2, offset: 0 });

      expect(result1.logs).toHaveLength(2);
      expect(result1.total).toBe(4);
      expect(result1.hasMore).toBe(true);

      const result2 = await getAuditLogs({}, { limit: 2, offset: 2 });

      expect(result2.logs).toHaveLength(2);
      expect(result2.total).toBe(4);
      expect(result2.hasMore).toBe(false);
    });

    it('should support sorting', async () => {
      const result = await getAuditLogs({}, { sortBy: 'timestamp', sortOrder: 'asc' });

      expect(result.logs).toHaveLength(4);
      expect(result.logs[0].actionType).toBe(AuditActionType.AUTH_LOGIN);
      expect(result.logs[3].actionType).toBe(AuditActionType.SERVER_DELETED);
    });

    it('should combine multiple filters', async () => {
      const result = await getAuditLogs({
        userId: 'user-1',
        actionResult: 'success',
      });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].actionType).toBe(AuditActionType.AUTH_LOGIN);
    });
  });

  describe('verifyAuditLogIntegrity', () => {
    it('should verify valid log chain', async () => {
      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
      });

      const result = await verifyAuditLogIntegrity();

      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect tampered entry hash', async () => {
      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
      });

      // Tamper with entry hash
      const db = getDatabase();
      db.prepare('UPDATE audit_logs SET entry_hash = ? WHERE user_id = ?').run(
        'tampered-hash',
        'user-2'
      );

      const result = await verifyAuditLogIntegrity();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Entry hash mismatch');
    });

    it('should detect broken hash chain', async () => {
      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
      });

      // Break the chain
      const db = getDatabase();
      db.prepare('UPDATE audit_logs SET previous_hash = ? WHERE user_id = ?').run(
        'wrong-previous-hash',
        'user-2'
      );

      const result = await verifyAuditLogIntegrity();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Previous hash mismatch');
    });
  });

  describe('exportAuditLogs', () => {
    beforeEach(async () => {
      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
        ipAddress: '127.0.0.1',
      });

      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
        resourceType: 'server',
        resourceId: 'server-1',
      });
    });

    it('should export logs as JSON', async () => {
      const exported = await exportAuditLogs('json');

      expect(exported).toBeDefined();
      const data = JSON.parse(exported);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0].username).toBe('bob'); // Sorted desc by timestamp
    });

    it('should export logs as CSV', async () => {
      const exported = await exportAuditLogs('csv');

      expect(exported).toBeDefined();
      const lines = exported.split('\n');
      expect(lines.length).toBeGreaterThan(2); // Header + 2 data rows
      expect(lines[0]).toContain('id,timestamp,date,user_id,username');
    });

    it('should export with filters', async () => {
      const exported = await exportAuditLogs('json', { userId: 'user-1' });

      const data = JSON.parse(exported);
      expect(data).toHaveLength(1);
      expect(data[0].username).toBe('alice');
    });
  });

  describe('retention policies', () => {
    it('should get default global retention policy', async () => {
      const policy = await getRetentionPolicy(null);

      expect(policy).toBeDefined();
      expect(policy?.tenantId).toBeNull();
      expect(policy?.retentionDays).toBe(90);
      expect(policy?.enabled).toBe(true);
    });

    it('should purge expired logs', async () => {
      // Create old log (91 days ago)
      const oldTimestamp = Date.now() - 91 * 24 * 60 * 60 * 1000;
      const db = getDatabase();

      const entry = await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      // Backdated entry
      db.prepare('UPDATE audit_logs SET timestamp = ? WHERE id = ?').run(oldTimestamp, entry.id);

      // Create recent log
      await createAuditLog({
        userId: 'user-2',
        username: 'bob',
        actionType: AuditActionType.SERVER_CREATED,
        actionResult: 'success',
      });

      // Purge expired
      const purgedCount = await purgeExpiredLogs(null);

      expect(purgedCount).toBe(1);

      // Verify only recent log remains
      const result = await getAuditLogs();
      expect(result.total).toBe(1);
      expect(result.logs[0].username).toBe('bob');
    });

    it('should not purge if retention is disabled', async () => {
      const db = getDatabase();
      db.prepare('UPDATE audit_retention_policies SET enabled = 0 WHERE tenant_id IS NULL').run();

      await createAuditLog({
        userId: 'user-1',
        username: 'alice',
        actionType: AuditActionType.AUTH_LOGIN,
        actionResult: 'success',
      });

      const purgedCount = await purgeExpiredLogs(null);

      expect(purgedCount).toBe(0);
    });
  });
});
