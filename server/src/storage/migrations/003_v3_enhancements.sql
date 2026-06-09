-- Migration 003: v3.0 Enhancements
-- Adds tables for v3.0 features

-- Create migrations tracking table (if not exists)
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

-- Create secrets table for secrets management
CREATE TABLE IF NOT EXISTS secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'keychain',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create registry_versions table for version tracking
CREATE TABLE IF NOT EXISTS registry_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  migrated_from TEXT,
  migrated_at INTEGER NOT NULL,
  notes TEXT
);

-- Create migration_history table for detailed migration tracking
CREATE TABLE IF NOT EXISTS migration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'success', 'failed', 'rolled_back'
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_message TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_secrets_key ON secrets(key);
CREATE INDEX IF NOT EXISTS idx_migration_history_status ON migration_history(status);
