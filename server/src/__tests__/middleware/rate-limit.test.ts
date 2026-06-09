/**
 * Rate Limit Middleware Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  authRateLimiter,
  apiRateLimiter,
  globalRateLimiter,
  createServerRateLimiter,
  cleanup,
} from '../../middleware/rate-limit.js';

describe('Rate Limit Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    cleanup();
  });

  describe('Auth Rate Limiter', () => {
    it('should allow requests within limit', async () => {
      app.post('/auth/login', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      for (let i = 0; i < 5; i++) {
        const response = await request(app).post('/auth/login').expect(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should block requests exceeding limit', async () => {
      app.post('/auth/login', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // Make 10 requests (at limit)
      for (let i = 0; i < 10; i++) {
        await request(app).post('/auth/login');
      }

      // 11th request should be rate limited
      const response = await request(app).post('/auth/login').expect(429);
      expect(response.body.error).toBeTruthy();
      expect(response.body.retryAfter).toBeTruthy();
    });

    it('should include Retry-After header', async () => {
      app.post('/auth/login', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      for (let i = 0; i < 10; i++) {
        await request(app).post('/auth/login');
      }

      const response = await request(app).post('/auth/login').expect(429);
      expect(response.headers['retry-after']).toBeTruthy();
    });
  });

  describe('API Rate Limiter', () => {
    it('should allow requests within limit', async () => {
      app.get('/api/data', apiRateLimiter, (req: Request, res: Response) => {
        res.json({ data: 'test' });
      });

      const response = await request(app).get('/api/data').expect(200);
      expect(response.body.data).toBe('test');
    });

    it('should track limits per user', async () => {
      app.get('/api/data', apiRateLimiter, (req: Request, res: Response) => {
        res.json({ data: 'test' });
      });

      // Different IPs should have separate limits
      const response1 = await request(app).get('/api/data').set('X-Forwarded-For', '1.2.3.4');
      const response2 = await request(app).get('/api/data').set('X-Forwarded-For', '5.6.7.8');

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('Global Rate Limiter', () => {
    it('should apply to all routes', async () => {
      app.use(globalRateLimiter);
      app.get('/test', (req: Request, res: Response) => {
        res.json({ ok: true });
      });

      const response = await request(app).get('/test').expect(200);
      expect(response.body.ok).toBe(true);
    });

    it('should block after exceeding global limit', async () => {
      app.use(globalRateLimiter);
      app.get('/test', (req: Request, res: Response) => {
        res.json({ ok: true });
      });

      // Make 100 requests (at limit)
      for (let i = 0; i < 100; i++) {
        await request(app).get('/test');
      }

      // 101st request should be rate limited
      await request(app).get('/test').expect(429);
    });
  });

  describe('Server-specific Rate Limiter', () => {
    it('should create limiter with custom max requests', async () => {
      const serverLimiter = createServerRateLimiter('test-server', 5);
      app.post('/tools/call', serverLimiter, (req: Request, res: Response) => {
        res.json({ result: 'ok' });
      });

      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        await request(app).post('/tools/call').expect(200);
      }

      // 6th request should be rate limited
      await request(app).post('/tools/call').expect(429);
    });

    it('should track limits per server', async () => {
      const limiter1 = createServerRateLimiter('server1', 5);
      const limiter2 = createServerRateLimiter('server2', 5);

      app.post('/server1', limiter1, (req: Request, res: Response) => {
        res.json({ ok: true });
      });
      app.post('/server2', limiter2, (req: Request, res: Response) => {
        res.json({ ok: true });
      });

      // Both servers should have independent limits
      for (let i = 0; i < 5; i++) {
        await request(app).post('/server1').expect(200);
        await request(app).post('/server2').expect(200);
      }
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit info in headers', async () => {
      app.get('/test', apiRateLimiter, (req: Request, res: Response) => {
        res.json({ ok: true });
      });

      const response = await request(app).get('/test').expect(200);

      // Should have standard rate limit headers
      expect(response.headers['ratelimit-limit']).toBeTruthy();
      expect(response.headers['ratelimit-remaining']).toBeTruthy();
      expect(response.headers['ratelimit-reset']).toBeTruthy();
    });
  });
});
