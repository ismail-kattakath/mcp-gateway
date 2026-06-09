/**
 * Tests for Users Model
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { UsersModel } from '../users.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test-users.db');

describe('UsersModel', () => {
  let db: Database.Database;
  let usersModel: UsersModel;

  beforeEach(() => {
    // Create in-memory database for tests
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Create users table
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'readonly')),
        tenant TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'locked')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );
    `);

    usersModel = new UsersModel(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const user = await usersModel.create({
        username: 'alice',
        password: 'password123456',
        email: 'alice@example.com',
        role: 'user',
      });

      expect(user.id).toBeTypeOf('string');
      expect(user.username).toBe('alice');
      expect(user.email).toBe('alice@example.com');
      expect(user.role).toBe('user');
      expect(user.status).toBe('active');
      expect(user).not.toHaveProperty('password_hash');
    });

    it('should reject password shorter than 12 characters', async () => {
      await expect(
        usersModel.create({
          username: 'alice',
          password: 'short',
        })
      ).rejects.toThrow('at least 12 characters');
    });

    it('should reject duplicate username', async () => {
      await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });

      await expect(
        usersModel.create({
          username: 'alice',
          password: 'password123456',
        })
      ).rejects.toThrow('already exists');
    });

    it('should create admin user', async () => {
      const user = await usersModel.create({
        username: 'admin',
        password: 'admin123456789',
        role: 'admin',
      });

      expect(user.role).toBe('admin');
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const created = await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });

      const found = usersModel.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.username).toBe('alice');
    });

    it('should return null for non-existent ID', () => {
      const found = usersModel.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });

      const found = usersModel.findByUsername('alice');

      expect(found).not.toBeNull();
      expect(found?.username).toBe('alice');
    });

    it('should return null for non-existent username', () => {
      const found = usersModel.findByUsername('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('authenticate', () => {
    beforeEach(async () => {
      await usersModel.create({
        username: 'alice',
        password: 'password123456',
        status: 'active',
      });
    });

    it('should authenticate with valid credentials', async () => {
      const user = await usersModel.authenticate('alice', 'password123456');

      expect(user).not.toBeNull();
      expect(user?.username).toBe('alice');
    });

    it('should reject invalid password', async () => {
      const user = await usersModel.authenticate('alice', 'wrongpassword');
      expect(user).toBeNull();
    });

    it('should reject non-existent user', async () => {
      const user = await usersModel.authenticate('nonexistent', 'password123456');
      expect(user).toBeNull();
    });

    it('should reject disabled user', async () => {
      const alice = usersModel.findByUsername('alice');
      await usersModel.update(alice!.id, { status: 'disabled' });

      const user = await usersModel.authenticate('alice', 'password123456');
      expect(user).toBeNull();
    });

    it('should update last_login_at on successful auth', async () => {
      const before = usersModel.findByUsername('alice');
      expect(before?.last_login_at).toBeNull();

      await usersModel.authenticate('alice', 'password123456');

      const after = usersModel.findByUsername('alice');
      expect(after?.last_login_at).not.toBeNull();
    });
  });

  describe('update', () => {
    it('should update user password', async () => {
      const user = await usersModel.create({
        username: 'alice',
        password: 'oldpassword123456',
      });

      await usersModel.update(user.id, {
        password: 'newpassword123456',
      });

      // Old password should not work
      const authOld = await usersModel.authenticate('alice', 'oldpassword123456');
      expect(authOld).toBeNull();

      // New password should work
      const authNew = await usersModel.authenticate('alice', 'newpassword123456');
      expect(authNew).not.toBeNull();
    });

    it('should update user role', async () => {
      const user = await usersModel.create({
        username: 'alice',
        password: 'password123456',
        role: 'user',
      });

      await usersModel.update(user.id, { role: 'admin' });

      const updated = usersModel.findById(user.id);
      expect(updated?.role).toBe('admin');
    });

    it('should update user status', async () => {
      const user = await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });

      await usersModel.update(user.id, { status: 'disabled' });

      const updated = usersModel.findById(user.id);
      expect(updated?.status).toBe('disabled');
    });

    it('should throw error for non-existent user', async () => {
      await expect(usersModel.update('non-existent-id', { role: 'admin' })).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      const user = await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });

      usersModel.delete(user.id);

      const found = usersModel.findById(user.id);
      expect(found).toBeNull();
    });

    it('should throw error for non-existent user', () => {
      expect(() => usersModel.delete('non-existent-id')).toThrow('not found');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await usersModel.create({
        username: 'alice',
        password: 'password123456',
        role: 'admin',
      });
      await usersModel.create({
        username: 'bob',
        password: 'password123456',
        role: 'user',
      });
      await usersModel.create({
        username: 'charlie',
        password: 'password123456',
        role: 'readonly',
      });
    });

    it('should list all users', () => {
      const users = usersModel.list();
      expect(users).toHaveLength(3);
    });

    it('should filter by role', () => {
      const admins = usersModel.list({ role: 'admin' });
      expect(admins).toHaveLength(1);
      expect(admins[0].username).toBe('alice');
    });

    it('should filter by status', async () => {
      const bob = usersModel.findByUsername('bob');
      await usersModel.update(bob!.id, { status: 'disabled' });

      const active = usersModel.list({ status: 'active' });
      expect(active).toHaveLength(2);

      const disabled = usersModel.list({ status: 'disabled' });
      expect(disabled).toHaveLength(1);
      expect(disabled[0].username).toBe('bob');
    });
  });

  describe('count', () => {
    it('should return 0 for empty table', () => {
      expect(usersModel.count()).toBe(0);
    });

    it('should count users', async () => {
      await usersModel.create({
        username: 'alice',
        password: 'password123456',
      });
      await usersModel.create({
        username: 'bob',
        password: 'password123456',
      });

      expect(usersModel.count()).toBe(2);
    });
  });
});
