/**
 * Audit API Routes Tests
 *
 * Tests for audit log REST API endpoints.
 *
 * Related: Epic #22 (Audit Logging)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { initDatabase, closeDatabase } from '../../storage/database.js';
import { usersModel } from '../../storage/models/users.js';
import { createAuditRouter } from '../audit-routes.js';
import { createAuditLog } from '../../audit/service.js';
import { generateAccessToken } from '../../auth/tokens.js';
import { AuditActionType } from '../../types/audit.js';
import { initializePassport } from '../../auth/index.js';

describe('Audit API Routes', () => {
  let app: Express;
  let adminToken: string;
  let userToken: string;
  let adminUser: { id: string; username: string; role: string };
  let normalUser: { id: string; username: string; role: string };

  beforeEach(async () => {
    // Initialize database
    initDatabase(':memory:');

    // Create test users
    adminUser = await usersModel.create({
      username: 'admin',
      password: 'admin123456abc',
      email: 'admin@test.com',
      role: 'admin',
      status: 'active',
    });

    normalUser = await usersModel.create({
      username: 'user',
      password: 'user123456abc',
      email: 'user@test.com',
      role: 'user',
      status: 'active',
    });

    // Generate tokens
    adminToken = generateAccessToken({
      sub: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
      tenant: null,
    });

    userToken = generateAccessToken({
      sub: normalUser.id,
      username: normalUser.username,
      role: normalUser.role,
      tenant: null,
    });

    // Create test audit logs
    await createAuditLog({
      userId: adminUser.id,
      username: adminUser.username,
      actionType: AuditActionType.AUTH_LOGIN,
      actionResult: 'success',
      ipAddress: '127.0.0.1',
    });

    await createAuditLog({
      userId: normalUser.id,
      username: normalUser.username,
      actionType: AuditActionType.AUTH_LOGIN_FAILED,
      actionResult: 'failure',
      ipAddress: '127.0.0.1',
    });

    await createAuditLog({
      userId: adminUser.id,
      username: adminUser.username,
      actionType: AuditActionType.SERVER_CREATED,
      actionResult: 'success',
      resourceType: 'server',
      resourceId: 'server-1',
    });

    // Create Express app
    app = express();
    app.use(express.json());

    // Initialize Passport
    const passport = await initializePassport();
    app.use(passport.initialize());

    // Mount audit routes
    app.use('/api/audit-logs', createAuditRouter());
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('GET /api/audit-logs', () => {
    it('should list audit logs for admin', async () => {
      const response = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toBeDefined();
      expect(response.body.logs).toHaveLength(3);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(3);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should require authentication', async () => {
      await request(app).get('/api/audit-logs').expect(401);
    });

    it('should filter by user ID', async () => {
      const response = await request(app)
        .get(`/api/audit-logs?user_id=${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(2);
      expect(
        response.body.logs.every((log: { userId: string }) => log.userId === adminUser.id)
      ).toBe(true);
    });

    it('should filter by username', async () => {
      const response = await request(app)
        .get('/api/audit-logs?username=user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].username).toBe('user');
    });

    it('should filter by action type', async () => {
      const response = await request(app)
        .get('/api/audit-logs?action_type=auth.login')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].actionType).toBe('auth.login');
    });

    it('should filter by action type with wildcard', async () => {
      const response = await request(app)
        .get('/api/audit-logs?action_type=auth.*')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(2);
    });

    it('should filter by action result', async () => {
      const response = await request(app)
        .get('/api/audit-logs?action_result=failure')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].actionResult).toBe('failure');
    });

    it('should filter by resource type', async () => {
      const response = await request(app)
        .get('/api/audit-logs?resource_type=server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].resourceType).toBe('server');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/audit-logs?limit=2&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(2);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/audit-logs?sort_by=timestamp&sort_order=asc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.logs).toHaveLength(3);
      expect(response.body.logs[0].actionType).toBe('auth.login');
    });
  });

  describe('GET /api/audit-logs/export', () => {
    it('should export logs as JSON', async () => {
      const response = await request(app)
        .get('/api/audit-logs/export?format=json')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('attachment');

      const data = JSON.parse(response.text);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(3);
    });

    it('should export logs as CSV', async () => {
      const response = await request(app)
        .get('/api/audit-logs/export?format=csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');

      const lines = response.text.split('\n');
      expect(lines[0]).toContain('id,timestamp,date,user_id,username');
      expect(lines.length).toBeGreaterThan(3); // Header + 3 data rows
    });

    it('should reject invalid format', async () => {
      const response = await request(app)
        .get('/api/audit-logs/export?format=xml')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
    });

    it('should require format parameter', async () => {
      const response = await request(app)
        .get('/api/audit-logs/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
    });

    it('should reject non-admin users', async () => {
      await request(app)
        .get('/api/audit-logs/export?format=json')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should export with filters', async () => {
      const response = await request(app)
        .get(`/api/audit-logs/export?format=json&user_id=${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = JSON.parse(response.text);
      expect(data).toHaveLength(2);
      expect(data.every((log: { userId: string }) => log.userId === adminUser.id)).toBe(true);
    });
  });

  describe('GET /api/audit-logs/verify', () => {
    it('should verify log integrity', async () => {
      const response = await request(app)
        .get('/api/audit-logs/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.totalEntries).toBe(3);
      expect(response.body.errorCount).toBe(0);
      expect(response.body.errors).toHaveLength(0);
    });

    it('should reject non-admin users', async () => {
      await request(app)
        .get('/api/audit-logs/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('GET /api/audit-logs/stats', () => {
    it('should return audit log statistics', async () => {
      const response = await request(app)
        .get('/api/audit-logs/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.totalEntries).toBe(3);
      expect(response.body.entriesByAction).toBeDefined();
      expect(response.body.entriesByResult).toBeDefined();
      expect(response.body.entriesByUser).toBeDefined();
      expect(response.body.failedLogins).toBe(1);
      expect(response.body.recentActivity).toBeDefined();
    });

    it('should reject non-admin users', async () => {
      await request(app)
        .get('/api/audit-logs/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});
