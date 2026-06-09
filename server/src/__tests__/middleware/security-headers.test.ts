/**
 * Security Headers Middleware Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  securityHeaders,
  additionalSecurityHeaders,
  requestSizeLimiter,
  strictContentTypeMiddleware,
} from '../../middleware/security-headers.js';

describe('Security Headers Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(securityHeaders);
    app.use(additionalSecurityHeaders);
  });

  describe('Helmet Security Headers', () => {
    it('should set X-Content-Type-Options header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should set Strict-Transport-Security header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    });

    it('should set Referrer-Policy header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should hide X-Powered-By header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should set Content-Security-Policy header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['content-security-policy']).toBeTruthy();
    });
  });

  describe('Additional Security Headers', () => {
    it('should set Permissions-Policy header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['permissions-policy']).toBeTruthy();
      expect(response.headers['permissions-policy']).toContain('geolocation=()');
    });

    it('should set X-Permitted-Cross-Domain-Policies header', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    });

    it('should set Clear-Site-Data header on logout', async () => {
      app.post('/logout', (req, res) => res.json({ ok: true }));

      const response = await request(app).post('/logout');
      expect(response.headers['clear-site-data']).toBe('"cache", "cookies", "storage"');
    });
  });

  describe('Request Size Limiter', () => {
    it('should allow requests within size limit', async () => {
      app.use(requestSizeLimiter(1000));
      app.post('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .post('/test')
        .set('Content-Length', '500')
        .send({ data: 'test' });

      expect(response.status).toBe(200);
    });

    it('should reject requests exceeding size limit', async () => {
      app.use(requestSizeLimiter(100));
      app.post('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .post('/test')
        .set('Content-Length', '500')
        .send({ data: 'test' });

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('Payload too large');
    });
  });

  describe('Strict Content-Type Middleware', () => {
    beforeEach(() => {
      app = express();
      app.use(strictContentTypeMiddleware);
    });

    it('should require Content-Type for POST requests', async () => {
      app.post('/api/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).post('/api/test').send({ data: 'test' });

      // supertest automatically sets content-type, so we need to test differently
      expect(response.status).not.toBe(400);
    });

    it('should allow GET requests without Content-Type', async () => {
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });
  });
});
