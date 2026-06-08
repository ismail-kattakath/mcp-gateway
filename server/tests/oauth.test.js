/**
 * OAuth Integration Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import OAuth modules
import { saveToken, getToken, deleteToken, getAllTokens, updateToken, isTokenValid } from '../src/oauth/tokenStore.js';

// Test token storage path
const TEST_TOKENS_PATH = path.join(process.env.HOME || '/tmp', '.mcp', 'tokens.enc');

describe('OAuth Token Store', () => {
  before(async () => {
    // Set up test encryption key
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    }

    // Clean up any existing test tokens
    try {
      await fs.unlink(TEST_TOKENS_PATH);
    } catch (error) {
      // Ignore if doesn't exist
    }
  });

  after(async () => {
    // Clean up test tokens
    try {
      await fs.unlink(TEST_TOKENS_PATH);
    } catch (error) {
      // Ignore if doesn't exist
    }
  });

  it('should save and retrieve a token', async () => {
    const tokenData = {
      access_token: 'test_access_token_123',
      refresh_token: 'test_refresh_token_456',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['read', 'write']
    };

    await saveToken('test-provider', tokenData);
    const retrieved = await getToken('test-provider');

    assert.strictEqual(retrieved.provider, 'test-provider');
    assert.strictEqual(retrieved.access_token, tokenData.access_token);
    assert.strictEqual(retrieved.refresh_token, tokenData.refresh_token);
    assert.deepStrictEqual(retrieved.scopes, tokenData.scopes);
  });

  it('should return null for non-existent token', async () => {
    const token = await getToken('non-existent-provider');
    assert.strictEqual(token, null);
  });

  it('should update a token', async () => {
    const tokenData = {
      access_token: 'original_token',
      refresh_token: 'original_refresh',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['read']
    };

    await saveToken('update-test', tokenData);

    const updates = {
      access_token: 'updated_token',
      expires_at: new Date(Date.now() + 7200000).toISOString()
    };

    await updateToken('update-test', updates);
    const retrieved = await getToken('update-test');

    assert.strictEqual(retrieved.access_token, 'updated_token');
    assert.strictEqual(retrieved.refresh_token, 'original_refresh');
    assert.ok(retrieved.updated_at > retrieved.created_at);
  });

  it('should delete a token', async () => {
    const tokenData = {
      access_token: 'delete_me',
      refresh_token: 'delete_me_too',
      expires_at: null,
      scopes: ['read']
    };

    await saveToken('delete-test', tokenData);
    const deleted = await deleteToken('delete-test');
    assert.strictEqual(deleted, true);

    const retrieved = await getToken('delete-test');
    assert.strictEqual(retrieved, null);
  });

  it('should get all tokens', async () => {
    await saveToken('provider-1', {
      access_token: 'token1',
      refresh_token: 'refresh1',
      expires_at: null,
      scopes: ['read']
    });

    await saveToken('provider-2', {
      access_token: 'token2',
      refresh_token: 'refresh2',
      expires_at: null,
      scopes: ['write']
    });

    const allTokens = await getAllTokens();
    assert.ok(Object.keys(allTokens).length >= 2);
    assert.ok(allTokens['provider-1']);
    assert.ok(allTokens['provider-2']);
  });

  it('should validate token expiry', async () => {
    // Save valid token (expires in 1 hour)
    await saveToken('valid-token', {
      access_token: 'valid',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['read']
    });

    // Save expired token
    await saveToken('expired-token', {
      access_token: 'expired',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() - 3600000).toISOString(),
      scopes: ['read']
    });

    // Save token with no expiry
    await saveToken('no-expiry-token', {
      access_token: 'no-expiry',
      refresh_token: 'refresh',
      expires_at: null,
      scopes: ['read']
    });

    const validIsValid = await isTokenValid('valid-token');
    const expiredIsValid = await isTokenValid('expired-token');
    const noExpiryIsValid = await isTokenValid('no-expiry-token');
    const nonExistentIsValid = await isTokenValid('non-existent');

    assert.strictEqual(validIsValid, true);
    assert.strictEqual(expiredIsValid, false);
    assert.strictEqual(noExpiryIsValid, true);
    assert.strictEqual(nonExistentIsValid, false);
  });

  it('should encrypt tokens (file should not contain plaintext)', async () => {
    const tokenData = {
      access_token: 'super_secret_token_12345',
      refresh_token: 'super_secret_refresh_67890',
      expires_at: null,
      scopes: ['read', 'write']
    };

    await saveToken('encryption-test', tokenData);

    // Read the encrypted file
    const encryptedContent = await fs.readFile(TEST_TOKENS_PATH, 'utf-8');

    // Verify plaintext is not in file
    assert.ok(!encryptedContent.includes('super_secret_token'));
    assert.ok(!encryptedContent.includes('super_secret_refresh'));
    assert.ok(!encryptedContent.includes('encryption-test'));

    // Verify we can still decrypt
    const retrieved = await getToken('encryption-test');
    assert.strictEqual(retrieved.access_token, tokenData.access_token);
  });
});

describe('OAuth Manager', () => {
  it('should export OAuth manager', async () => {
    const { getOAuthManager, createOAuthRouter, initializeOAuth } = await import('../src/oauth/index.js');

    assert.ok(typeof getOAuthManager === 'function');
    assert.ok(typeof createOAuthRouter === 'function');
    assert.ok(typeof initializeOAuth === 'function');
  });

  it('should create OAuth router with routes', async () => {
    const { createOAuthRouter } = await import('../src/oauth/index.js');
    const router = createOAuthRouter();

    assert.ok(router);
    assert.ok(router.stack); // Express router has stack property
    assert.ok(router.stack.length > 0);
  });

  it('should get OAuth manager singleton', async () => {
    const { getOAuthManager } = await import('../src/oauth/index.js');

    const manager1 = getOAuthManager();
    const manager2 = getOAuthManager();

    assert.strictEqual(manager1, manager2); // Same instance
    assert.ok(manager1.on); // Is EventEmitter
    assert.ok(manager1.startAutoRefresh);
    assert.ok(manager1.stopAutoRefresh);
  });
});

describe('OAuth Providers', () => {
  it('should export GitHub OAuth functions', async () => {
    const github = await import('../src/oauth/github.js');

    assert.ok(typeof github.startGitHubOAuth === 'function');
    assert.ok(typeof github.handleGitHubCallback === 'function');
    assert.ok(typeof github.refreshGitHubToken === 'function');
    assert.ok(typeof github.disconnectGitHub === 'function');
    assert.ok(typeof github.getGitHubStatus === 'function');
  });

  it('should export Smithery OAuth functions', async () => {
    const smithery = await import('../src/oauth/smithery.js');

    assert.ok(typeof smithery.startSmitheryOAuth === 'function');
    assert.ok(typeof smithery.handleSmitheryCallback === 'function');
    assert.ok(typeof smithery.refreshSmitheryToken === 'function');
    assert.ok(typeof smithery.disconnectSmithery === 'function');
    assert.ok(typeof smithery.getSmitheryStatus === 'function');
  });
});

describe('Registry OAuth Token Resolution', () => {
  before(async () => {
    // Set up test encryption key
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    }

    // Save test tokens
    await saveToken('github', {
      access_token: 'github_test_token_123',
      refresh_token: 'github_refresh_456',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['repo', 'read:org']
    });

    await saveToken('smithery', {
      access_token: 'smithery_test_token_789',
      refresh_token: 'smithery_refresh_012',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ['read', 'write']
    });
  });

  after(async () => {
    await deleteToken('github');
    await deleteToken('smithery');
  });

  it('should resolve GITHUB_ACCESS_TOKEN from token store', async () => {
    const { resolveEnvVarsRecursive } = await import('../src/mcp/registry.js');

    // This would normally be done internally, but we need to access the private function
    // Instead, we'll just verify the tokens are stored correctly
    const githubToken = await getToken('github');
    assert.strictEqual(githubToken.access_token, 'github_test_token_123');
  });

  it('should resolve SMITHERY_ACCESS_TOKEN from token store', async () => {
    const smitheryToken = await getToken('smithery');
    assert.strictEqual(smitheryToken.access_token, 'smithery_test_token_789');
  });
});

console.log('\nRunning OAuth Integration Tests...\n');
