-- Migration 002: Add SAML 2.0 Support
-- Related: Epic #19 (SAML SSO)
-- Created: 2026-06-09

-- ============================================================
-- 1. Add SAML columns to users table
-- ============================================================

-- Add SAML provider columns to users table
ALTER TABLE users ADD COLUMN saml_provider TEXT;  -- 'okta', 'azure', 'generic:<name>'
ALTER TABLE users ADD COLUMN saml_nameid TEXT;    -- SAML NameID (unique identifier)

-- Add indexes for SAML lookups
CREATE INDEX IF NOT EXISTS idx_users_saml_provider ON users(saml_provider);
CREATE INDEX IF NOT EXISTS idx_users_saml_nameid ON users(saml_nameid);

-- ============================================================
-- 2. SAML Providers Table
-- ============================================================

CREATE TABLE IF NOT EXISTS saml_providers (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  name TEXT UNIQUE NOT NULL,                          -- Provider name (e.g., "okta", "azure", "custom-adfs")

  -- Provider type
  type TEXT NOT NULL CHECK(type IN ('okta', 'azure', 'generic')),

  -- SAML configuration
  entity_id TEXT NOT NULL,                            -- Service Provider Entity ID
  sso_url TEXT NOT NULL,                              -- IdP Single Sign-On URL
  slo_url TEXT,                                       -- IdP Single Logout URL (optional)
  certificate TEXT NOT NULL,                          -- IdP X.509 certificate (PEM format)

  -- Service Provider configuration
  sp_entity_id TEXT NOT NULL,                         -- Service Provider Entity ID (callback URL)
  acs_url TEXT NOT NULL,                              -- Assertion Consumer Service URL

  -- SAML options
  want_assertions_signed INTEGER DEFAULT 1,           -- Boolean (require signed assertions)
  want_response_signed INTEGER DEFAULT 1,             -- Boolean (require signed response)
  force_authn INTEGER DEFAULT 0,                      -- Boolean (force re-authentication)

  -- Attribute mapping
  attribute_map TEXT NOT NULL DEFAULT '{}',           -- JSON (SAML attributes -> user fields)
  role_mappings TEXT NOT NULL DEFAULT '{"default":"user"}',  -- JSON (SAML groups -> roles)

  -- Metadata
  metadata_url TEXT,                                  -- IdP metadata URL (for auto-refresh)
  metadata_updated_at TEXT,                           -- Last metadata refresh

  -- Status
  enabled INTEGER DEFAULT 1,                          -- Boolean (1=enabled)

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_saml_providers_name ON saml_providers(name);
CREATE INDEX IF NOT EXISTS idx_saml_providers_type ON saml_providers(type);
CREATE INDEX IF NOT EXISTS idx_saml_providers_enabled ON saml_providers(enabled);

-- ============================================================
-- 3. SAML Assertions Table
-- ============================================================
-- Stores SAML assertions for audit and replay protection

CREATE TABLE IF NOT EXISTS saml_assertions (
  -- Identity
  id TEXT PRIMARY KEY,                                -- SAML Assertion ID
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,                        -- Provider name (matches saml_providers.name)

  -- Assertion data
  nameid TEXT NOT NULL,                               -- SAML NameID
  session_index TEXT,                                 -- SAML SessionIndex (for logout)
  attributes TEXT,                                    -- JSON (extracted SAML attributes)

  -- Validity
  not_before TEXT NOT NULL,                           -- SAML NotBefore condition
  not_on_or_after TEXT NOT NULL,                      -- SAML NotOnOrAfter condition

  -- Context
  ip_address TEXT,                                    -- Client IP
  user_agent TEXT,                                    -- User-Agent

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_saml_assertions_user_id ON saml_assertions(user_id);
CREATE INDEX IF NOT EXISTS idx_saml_assertions_provider_name ON saml_assertions(provider_name);
CREATE INDEX IF NOT EXISTS idx_saml_assertions_nameid ON saml_assertions(nameid);
CREATE INDEX IF NOT EXISTS idx_saml_assertions_not_on_or_after ON saml_assertions(not_on_or_after);
CREATE INDEX IF NOT EXISTS idx_saml_assertions_created_at ON saml_assertions(created_at);

-- ============================================================
-- DESIGN NOTES
-- ============================================================
-- 1. SAML provider columns on users table:
--    - saml_provider: Provider name for quick lookup
--    - saml_nameid: SAML NameID (unique identifier from IdP)
--
-- 2. SAML providers table:
--    - Supports Okta, Azure AD, and generic SAML 2.0 IdPs
--    - Stores IdP certificate for signature validation
--    - Attribute mapping: SAML claims -> user model fields
--    - Role mapping: SAML groups -> RBAC roles
--
-- 3. SAML assertions table:
--    - Stores assertions for audit trail
--    - Prevents replay attacks (check assertion ID)
--    - Tracks session for Single Logout (SLO)
--    - Auto-cleanup expired assertions via cron job
--
-- 4. Security:
--    - Assertions must be signed (want_assertions_signed=1)
--    - Validate signature using IdP certificate
--    - Validate audience (matches SP entity ID)
--    - Validate conditions (NotBefore, NotOnOrAfter)
--    - Prevent replay attacks (track assertion IDs)
--
-- ============================================================
-- ATTRIBUTE MAPPING EXAMPLES
-- ============================================================
-- Okta:
-- {
--   "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
--   "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
--   "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
--   "groups": "http://schemas.xmlsoap.org/claims/Group"
-- }
--
-- Azure AD:
-- {
--   "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
--   "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
--   "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
--   "groups": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
-- }
--
-- ============================================================
-- ROLE MAPPING EXAMPLES
-- ============================================================
-- {
--   "Administrators": "admin",
--   "Developers": "user",
--   "Viewers": "readonly",
--   "default": "readonly"
-- }
--
-- ============================================================
-- JIT USER PROVISIONING
-- ============================================================
-- When a user authenticates via SAML:
--
-- 1. Validate SAML assertion:
--    - Signature (XML-DSig)
--    - Audience (matches SP Entity ID)
--    - Conditions (NotBefore, NotOnOrAfter)
--    - Assertion ID not used before (replay protection)
--
-- 2. Extract SAML attributes using attribute_map
--
-- 3. Check if user exists by SAML NameID:
--    - SELECT * FROM users WHERE saml_provider = ? AND saml_nameid = ?
--
-- 4. If not found, check by email:
--    - SELECT * FROM users WHERE email = ?
--
-- 5. If found by email, link SAML account:
--    - UPDATE users SET saml_provider = ?, saml_nameid = ? WHERE id = ?
--
-- 6. If not found at all, create new user:
--    - INSERT INTO users (username, email, password_hash, saml_provider, saml_nameid, role, status)
--      VALUES (?, ?, '<saml>', ?, ?, ?, 'active')
--    - password_hash = '<saml>' is a placeholder (user can't login via password)
--
-- 7. Apply role mapping:
--    - If SAML groups contain "Administrators", assign "admin" role
--    - Otherwise, use default role from provider config
--
-- 8. Store assertion:
--    - INSERT INTO saml_assertions (id, user_id, provider_name, nameid, ...)
--      VALUES (?, ?, ?, ?, ...)
--
-- 9. Create JWT session
--
-- ============================================================
-- CLEANUP QUERIES
-- ============================================================
-- Delete expired assertions (older than 24 hours):
-- DELETE FROM saml_assertions WHERE not_on_or_after < datetime('now', '-24 hours');
--
-- Delete old assertions (older than 90 days):
-- DELETE FROM saml_assertions WHERE created_at < datetime('now', '-90 days');
--
-- ============================================================
