/**
 * OAuth Manager
 *
 * Coordinates OAuth flows, token refresh, and Express route registration
 */

import { Router } from 'express';
import cookieParser from 'cookie-parser';
import { EventEmitter } from 'events';
import logger from '../logging/logger.js';
import { getAllTokens, isTokenValid } from './tokenStore.js';
import * as github from './github.js';
import * as smithery from './smithery.js';

/**
 * OAuth Manager class
 * Handles auto-refresh and event emission for token updates
 */
class OAuthManager extends EventEmitter {
  constructor() {
    super();
    this.refreshInterval = null;
    this.refreshCheckIntervalMs = 60 * 60 * 1000; // Check every hour
  }

  /**
   * Initialize OAuth manager
   */
  async initialize() {
    logger.info('Initializing OAuth manager');

    // Start auto-refresh background job
    this.startAutoRefresh();

    // Emit ready event
    this.emit('ready');
  }

  /**
   * Start background job to auto-refresh tokens
   */
  startAutoRefresh() {
    if (this.refreshInterval) {
      logger.warn('Auto-refresh already running');
      return;
    }

    logger.info('Starting OAuth token auto-refresh', {
      interval: `${this.refreshCheckIntervalMs / 1000 / 60} minutes`
    });

    this.refreshInterval = setInterval(async () => {
      await this.checkAndRefreshTokens();
    }, this.refreshCheckIntervalMs);

    // Also check immediately on start
    setImmediate(() => this.checkAndRefreshTokens());
  }

  /**
   * Stop auto-refresh background job
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Stopped OAuth token auto-refresh');
    }
  }

  /**
   * Check all tokens and refresh if needed
   */
  async checkAndRefreshTokens() {
    try {
      const tokens = await getAllTokens();
      const providers = Object.keys(tokens);

      if (providers.length === 0) {
        logger.debug('No OAuth tokens to refresh');
        return;
      }

      logger.debug('Checking OAuth tokens for refresh', { providers });

      for (const provider of providers) {
        const token = tokens[provider];

        // Skip if no expiry
        if (!token.expires_at) {
          logger.debug('Token has no expiry, skipping refresh', { provider });
          continue;
        }

        // Check if token needs refresh (expires in < 1 hour)
        const expiryTime = new Date(token.expires_at).getTime();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now < expiryTime - oneHour) {
          logger.debug('Token still valid, no refresh needed', {
            provider,
            expiresIn: `${Math.floor((expiryTime - now) / 1000 / 60)} minutes`
          });
          continue;
        }

        // Token needs refresh
        logger.info('Token expiring soon, refreshing', {
          provider,
          expiresAt: token.expires_at
        });

        await this.refreshToken(provider);
      }
    } catch (error) {
      logger.error('Error checking tokens for refresh', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Refresh a token for a specific provider
   */
  async refreshToken(provider) {
    try {
      let result;

      switch (provider) {
        case 'github':
          // Call GitHub refresh internally
          result = await this.refreshGitHubInternal();
          break;

        case 'smithery':
          // Call Smithery refresh internally
          result = await this.refreshSmitheryInternal();
          break;

        default:
          logger.warn('Unknown provider for token refresh', { provider });
          return;
      }

      if (result.success) {
        logger.info('Token refreshed successfully', { provider });
        this.emit('token:refreshed', { provider, expiresAt: result.expires_at });
      } else {
        logger.error('Token refresh failed', { provider, error: result.error });
        this.emit('token:refresh_failed', { provider, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to refresh token', {
        provider,
        error: error.message,
        stack: error.stack
      });
      this.emit('token:refresh_failed', { provider, error: error.message });
    }
  }

  /**
   * Internal GitHub token refresh (bypasses HTTP)
   */
  async refreshGitHubInternal() {
    try {
      // Import refresh function
      const { refreshGitHubToken } = await import('./github.js');

      // Create mock request/response objects
      const mockReq = {};
      const mockRes = {
        status: (code) => mockRes,
        json: (data) => data
      };

      // Call refresh handler
      const result = await new Promise((resolve) => {
        mockRes.json = (data) => resolve(data);
        refreshGitHubToken(mockReq, mockRes);
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Internal Smithery token refresh (bypasses HTTP)
   */
  async refreshSmitheryInternal() {
    try {
      // Import refresh function
      const { refreshSmitheryToken } = await import('./smithery.js');

      // Create mock request/response objects
      const mockReq = {};
      const mockRes = {
        status: (code) => mockRes,
        json: (data) => data
      };

      // Call refresh handler
      const result = await new Promise((resolve) => {
        mockRes.json = (data) => resolve(data);
        refreshSmitheryToken(mockReq, mockRes);
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get token for a provider (for use by backends)
   */
  async getAccessToken(provider) {
    const { getToken } = await import('./tokenStore.js');
    const token = await getToken(provider);
    return token?.access_token || null;
  }

  /**
   * Check if provider is connected
   */
  async isConnected(provider) {
    return await isTokenValid(provider);
  }

  /**
   * Shutdown manager
   */
  async shutdown() {
    logger.info('Shutting down OAuth manager');
    this.stopAutoRefresh();
    this.removeAllListeners();
  }
}

// Singleton instance
let oauthManager = null;

/**
 * Get OAuth manager singleton
 */
export function getOAuthManager() {
  if (!oauthManager) {
    oauthManager = new OAuthManager();
  }
  return oauthManager;
}

/**
 * Create OAuth router with all endpoints
 */
export function createOAuthRouter() {
  const router = Router();

  // Add cookie parser middleware for state validation
  router.use(cookieParser());

  // ===== GitHub OAuth Routes =====
  router.get('/github/start', github.startGitHubOAuth);
  router.get('/github/callback', github.handleGitHubCallback);
  router.post('/github/refresh', github.refreshGitHubToken);
  router.post('/github/disconnect', github.disconnectGitHub);
  router.get('/github/status', github.getGitHubStatus);

  // ===== Smithery OAuth Routes =====
  router.get('/smithery/start', smithery.startSmitheryOAuth);
  router.get('/smithery/callback', smithery.handleSmitheryCallback);
  router.post('/smithery/refresh', smithery.refreshSmitheryToken);
  router.post('/smithery/disconnect', smithery.disconnectSmithery);
  router.get('/smithery/status', smithery.getSmitheryStatus);

  // ===== General OAuth Status =====
  router.get('/status', async (req, res) => {
    try {
      const tokens = await getAllTokens();
      const providers = {};

      for (const [provider, token] of Object.entries(tokens)) {
        const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
        providers[provider] = {
          connected: true,
          scopes: token.scopes || [],
          expires_at: token.expires_at,
          expired: isExpired,
          has_refresh_token: !!token.refresh_token,
          user: token.user_info?.login || token.user_info?.username || token.user_info?.email || null
        };
      }

      res.json({
        providers,
        total: Object.keys(providers).length,
        available: ['github', 'smithery']
      });
    } catch (error) {
      logger.error('Failed to get OAuth status', { error: error.message });
      res.status(500).json({
        error: 'Failed to get status',
        message: error.message
      });
    }
  });

  return router;
}

/**
 * Initialize OAuth system
 */
export async function initializeOAuth() {
  const manager = getOAuthManager();
  await manager.initialize();
  return manager;
}

export default {
  getOAuthManager,
  createOAuthRouter,
  initializeOAuth
};
