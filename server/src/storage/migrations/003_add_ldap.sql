-- Migration 003: Add LDAP/Active Directory Support
-- Related: Epic #20 (LDAP/AD Integration)
-- Created: 2026-06-09

-- ============================================================
-- 1. Add LDAP columns to users table
-- ============================================================

-- Add LDAP provider columns to users table
ALTER TABLE users ADD COLUMN ldap_provider TEXT;  -- Provider name (e.g., 'openldap', 'ad')
ALTER TABLE users ADD COLUMN ldap_dn TEXT;        -- Distinguished Name (unique identifier)

-- Add indexes for LDAP lookups
CREATE INDEX IF NOT EXISTS idx_users_ldap_provider ON users(ldap_provider);
CREATE INDEX IF NOT EXISTS idx_users_ldap_dn ON users(ldap_dn);

-- ============================================================
-- 2. LDAP Providers Table
-- ============================================================

CREATE TABLE IF NOT EXISTS ldap_providers (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  name TEXT UNIQUE NOT NULL,                          -- Provider name (e.g., "openldap", "ad", "corp-ldap")

  -- Connection configuration
  url TEXT NOT NULL,                                  -- LDAP server URL (e.g., ldap://server:389 or ldaps://server:636)
  bind_dn TEXT,                                       -- Bind DN for search operations (optional if anonymous bind)
  bind_password TEXT,                                 -- Bind password (encrypted in production)

  -- Search configuration
  base_dn TEXT NOT NULL,                              -- Base DN for user searches
  search_filter TEXT DEFAULT '(uid={{username}})',    -- Search filter (supports {{username}} template)

  -- Attribute mapping
  attribute_mapping TEXT NOT NULL DEFAULT '{}',       -- JSON (LDAP attributes -> user fields)
  group_mapping TEXT NOT NULL DEFAULT '{"default":"user"}',  -- JSON (LDAP groups -> RBAC roles)

  -- TLS options
  tls_enabled INTEGER DEFAULT 1,                      -- Boolean (use TLS/LDAPS)
  tls_reject_unauthorized INTEGER DEFAULT 1,          -- Boolean (validate TLS certificate)

  -- Connection pooling
  pool_size INTEGER DEFAULT 5,                        -- Number of connections in pool
  timeout INTEGER DEFAULT 10000,                      -- Connection timeout (milliseconds)

  -- Status
  enabled INTEGER DEFAULT 1,                          -- Boolean (1=enabled)

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ldap_providers_name ON ldap_providers(name);
CREATE INDEX IF NOT EXISTS idx_ldap_providers_enabled ON ldap_providers(enabled);

-- ============================================================
-- 3. LDAP Authentication Logs Table
-- ============================================================
-- Stores LDAP authentication attempts for audit

CREATE TABLE IF NOT EXISTS ldap_auth_logs (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,                        -- Provider name (matches ldap_providers.name)

  -- Authentication data
  username TEXT NOT NULL,                             -- Username used for authentication
  dn TEXT,                                            -- Resolved DN (if successful)
  groups TEXT,                                        -- JSON array of groups (if successful)

  -- Result
  success INTEGER NOT NULL,                           -- Boolean (1=success, 0=failure)
  error_message TEXT,                                 -- Error message (if failed)

  -- Context
  ip_address TEXT,                                    -- Client IP
  user_agent TEXT,                                    -- User-Agent

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ldap_auth_logs_user_id ON ldap_auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ldap_auth_logs_provider_name ON ldap_auth_logs(provider_name);
CREATE INDEX IF NOT EXISTS idx_ldap_auth_logs_username ON ldap_auth_logs(username);
CREATE INDEX IF NOT EXISTS idx_ldap_auth_logs_created_at ON ldap_auth_logs(created_at);

-- ============================================================
-- DESIGN NOTES
-- ============================================================
-- 1. LDAP provider columns on users table:
--    - ldap_provider: Provider name for quick lookup
--    - ldap_dn: Distinguished Name (unique identifier from LDAP)
--
-- 2. LDAP providers table:
--    - Supports OpenLDAP, Active Directory, and generic LDAP servers
--    - Connection pooling for performance
--    - Attribute mapping: LDAP attributes -> user model fields
--    - Group mapping: LDAP groups -> RBAC roles
--
-- 3. LDAP authentication logs table:
--    - Stores authentication attempts for audit trail
--    - Tracks successful and failed authentications
--    - Useful for security monitoring and compliance
--    - Auto-cleanup old logs via cron job
--
-- 4. Security:
--    - Use TLS/LDAPS for encrypted connections (tls_enabled=1)
--    - Validate TLS certificates (tls_reject_unauthorized=1)
--    - Store bind passwords encrypted (use keytar in production)
--    - Connection pooling prevents connection exhaustion
--
-- ============================================================
-- ATTRIBUTE MAPPING EXAMPLES
-- ============================================================
-- OpenLDAP:
-- {
--   "username": "uid",
--   "email": "mail",
--   "fullName": "cn",
--   "firstName": "givenName",
--   "lastName": "sn",
--   "groups": "memberOf"
-- }
--
-- Active Directory:
-- {
--   "username": "sAMAccountName",
--   "email": "mail",
--   "fullName": "displayName",
--   "firstName": "givenName",
--   "lastName": "sn",
--   "groups": "memberOf"
-- }
--
-- ============================================================
-- GROUP MAPPING EXAMPLES
-- ============================================================
-- {
--   "CN=Admins,OU=Groups,DC=corp,DC=example,DC=com": "admin",
--   "CN=Developers,OU=Groups,DC=corp,DC=example,DC=com": "user",
--   "CN=Viewers,OU=Groups,DC=corp,DC=example,DC=com": "readonly",
--   "default": "readonly"
-- }
--
-- ============================================================
-- JIT USER PROVISIONING
-- ============================================================
-- When a user authenticates via LDAP:
--
-- 1. Connect to LDAP server:
--    - Get connection from pool
--    - Bind with user credentials
--
-- 2. Search for user entry:
--    - Use search_filter with username substitution
--    - Extract attributes using attribute_mapping
--
-- 3. Check if user exists by LDAP DN:
--    - SELECT * FROM users WHERE ldap_provider = ? AND ldap_dn = ?
--
-- 4. If not found, check by email:
--    - SELECT * FROM users WHERE email = ?
--
-- 5. If found by email, link LDAP account:
--    - UPDATE users SET ldap_provider = ?, ldap_dn = ? WHERE id = ?
--
-- 6. If not found at all, create new user:
--    - INSERT INTO users (username, email, password_hash, ldap_provider, ldap_dn, role, status)
--      VALUES (?, ?, '<ldap>', ?, ?, ?, 'active')
--    - password_hash = '<ldap>' is a placeholder (user can't login via password)
--
-- 7. Apply group mapping:
--    - Resolve LDAP groups (handle nested groups for AD)
--    - Map to RBAC roles using group_mapping
--
-- 8. Log authentication attempt:
--    - INSERT INTO ldap_auth_logs (id, user_id, provider_name, username, dn, groups, success, ...)
--      VALUES (?, ?, ?, ?, ?, ?, 1, ...)
--
-- 9. Create JWT session
--
-- ============================================================
-- ACTIVE DIRECTORY SPECIFICS
-- ============================================================
-- 1. Search filter for AD:
--    - sAMAccountName: (&(objectClass=user)(sAMAccountName={{username}}))
--    - userPrincipalName: (&(objectClass=user)(userPrincipalName={{username}}@domain.com))
--
-- 2. Nested group resolution:
--    - Use memberOf attribute recursively
--    - AD supports transitive group membership
--
-- 3. Domain controller failover:
--    - Support multiple URLs (comma-separated)
--    - Try next DC on connection failure
--
-- ============================================================
-- CLEANUP QUERIES
-- ============================================================
-- Delete old authentication logs (older than 90 days):
-- DELETE FROM ldap_auth_logs WHERE created_at < datetime('now', '-90 days');
--
-- ============================================================
