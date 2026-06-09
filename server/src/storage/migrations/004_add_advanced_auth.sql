-- Migration 004: Add Advanced Authentication (Kerberos/mTLS)
-- Epic #21 - Advanced Authentication
--
-- This migration adds tables for Kerberos and mTLS configuration,
-- and extends users table with additional identity fields.

-- Kerberos Configuration Table
CREATE TABLE IF NOT EXISTS kerberos_config (
  id TEXT PRIMARY KEY DEFAULT ('krb_' || lower(hex(randomblob(16)))),
  servicePrincipal TEXT NOT NULL,
  keytabPath TEXT NOT NULL,
  realm TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- mTLS Configuration Table
CREATE TABLE IF NOT EXISTS mtls_config (
  id TEXT PRIMARY KEY DEFAULT ('mtls_' || lower(hex(randomblob(16)))),
  requireClientCert INTEGER DEFAULT 1,
  caCertPath TEXT NOT NULL,
  crlPath TEXT,
  ocspUrl TEXT,
  identityField TEXT DEFAULT 'CN', -- CN, SAN, or OID
  customOid TEXT, -- for custom OID extraction
  enabled INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

-- Extend users table with Kerberos and certificate identity fields
-- Check if columns exist first (idempotent migration)
ALTER TABLE users ADD COLUMN kerberos_principal TEXT;
ALTER TABLE users ADD COLUMN certificate_dn TEXT;

-- Create indexes for identity lookups
CREATE INDEX IF NOT EXISTS idx_users_kerberos_principal ON users(kerberos_principal);
CREATE INDEX IF NOT EXISTS idx_users_certificate_dn ON users(certificate_dn);

-- Create indexes for enabled lookups
CREATE INDEX IF NOT EXISTS idx_kerberos_config_enabled ON kerberos_config(enabled);
CREATE INDEX IF NOT EXISTS idx_mtls_config_enabled ON mtls_config(enabled);
