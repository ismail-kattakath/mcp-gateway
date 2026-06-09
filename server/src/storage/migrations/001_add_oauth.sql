-- Migration 001: Add OAuth 2.0 Support
-- Related: Epic #18 (OAuth 2.0 Support)
-- Created: 2026-06-09

-- ============================================================
-- 1. Add OAuth columns to users table
-- ============================================================

-- Add OAuth provider columns to users table
ALTER TABLE users ADD COLUMN github_id TEXT;
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN oauth_provider TEXT;  -- 'github', 'google', 'generic:<name>'
ALTER TABLE users ADD COLUMN oauth_id TEXT;        -- Generic OAuth ID

-- Add indexes for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider ON users(oauth_provider);
CREATE INDEX IF NOT EXISTS idx_users_oauth_id ON users(oauth_id);

-- Make password_hash nullable (OAuth users may not have password)
-- Note: SQLite doesn't support ALTER COLUMN, so we keep it NOT NULL for now
-- New OAuth users will have a placeholder hash

-- ============================================================
-- 2. OAuth Providers Table
-- ============================================================

CREATE TABLE IF NOT EXISTS oauth_providers (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  name TEXT UNIQUE NOT NULL,                          -- Provider name (e.g., "github", "google", "custom-okta")

  -- Provider type
  type TEXT NOT NULL CHECK(type IN ('github', 'google', 'generic')),

  -- OAuth credentials
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,                        -- Encrypted

  -- OAuth configuration
  scopes TEXT NOT NULL,                               -- JSON array
  redirect_uri TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',                  -- JSON (authorizationURL, tokenURL, etc. for generic)
  role_mappings TEXT NOT NULL DEFAULT '{"default":"user"}',  -- JSON (maps OAuth roles to local roles)

  -- Status
  enabled INTEGER DEFAULT 1,                          -- Boolean (1=enabled)

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_oauth_providers_name ON oauth_providers(name);
CREATE INDEX IF NOT EXISTS idx_oauth_providers_type ON oauth_providers(type);
CREATE INDEX IF NOT EXISTS idx_oauth_providers_enabled ON oauth_providers(enabled);

-- ============================================================
-- 3. OAuth Tokens Table
-- ============================================================
-- Stores OAuth access/refresh tokens (encrypted)

CREATE TABLE IF NOT EXISTS oauth_tokens (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,                        -- Provider name (matches oauth_providers.name)

  -- Tokens (encrypted)
  access_token TEXT NOT NULL,                         -- Encrypted OAuth access token
  refresh_token TEXT,                                 -- Encrypted OAuth refresh token (optional)
  token_type TEXT DEFAULT 'Bearer',                   -- Token type
  scopes TEXT,                                        -- JSON array of granted scopes

  -- Expiry
  expires_at TEXT NOT NULL,                           -- Access token expiry
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider_name ON oauth_tokens(provider_name);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- ============================================================
-- DESIGN NOTES
-- ============================================================
-- 1. OAuth provider columns on users table:
--    - github_id, google_id: Native OAuth IDs for quick lookup
--    - oauth_provider + oauth_id: Generic OAuth for custom providers
--
-- 2. OAuth providers table:
--    - Supports dynamic provider registration
--    - Client secrets are field-level encrypted
--    - Role mappings allow org/domain-based role assignment
--
-- 3. OAuth tokens table:
--    - Stores encrypted access/refresh tokens
--    - Supports token refresh flow
--    - Auto-cleanup expired tokens via cron job
--
-- 4. Security:
--    - All secrets encrypted with AES-256-GCM
--    - State parameter validation (CSRF protection)
--    - Tokens stored separately from user credentials
--
-- ============================================================
-- JIT USER PROVISIONING
-- ============================================================
-- When a user authenticates via OAuth:
--
-- 1. Check if user exists by OAuth ID:
--    - GitHub: SELECT * FROM users WHERE github_id = ?
--    - Google: SELECT * FROM users WHERE google_id = ?
--    - Generic: SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?
--
-- 2. If not found, check by email:
--    - SELECT * FROM users WHERE email = ?
--
-- 3. If found by email, link OAuth account:
--    - UPDATE users SET github_id = ? WHERE id = ?
--
-- 4. If not found at all, create new user:
--    - INSERT INTO users (username, email, password_hash, github_id, role, status)
--      VALUES (?, ?, '<oauth>', ?, 'user', 'active')
--    - password_hash = '<oauth>' is a placeholder (user can't login via password)
--
-- 5. Apply role mapping:
--    - If user is in "my-org:admin" team, assign "admin" role
--    - If user email ends with "@mycompany.com", assign "user" role
--    - Otherwise, use default role from provider config
--
-- ============================================================
