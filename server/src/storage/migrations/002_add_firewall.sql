-- Migration 002: Add firewall_rules table
-- Epic #23 (Network Security)
-- Created: 2026-06-09

-- ============================================================
-- FIREWALL_RULES TABLE
-- ============================================================
-- IP filtering rules (allow/deny lists)
-- Replaces the IP allowlist in .mcp-gateway.json

CREATE TABLE IF NOT EXISTS firewall_rules (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4

  -- Rule configuration
  ip_range TEXT NOT NULL,                   -- IP or CIDR (192.168.1.0/24, 10.0.0.1)
  rule_type TEXT NOT NULL CHECK(rule_type IN ('allow', 'deny')),
  description TEXT,                         -- Human-readable description

  -- Status
  enabled INTEGER DEFAULT 1,                -- Boolean (1=enabled, 0=disabled)

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT                           -- User ID
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_firewall_rules_rule_type ON firewall_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_enabled ON firewall_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_tenant ON firewall_rules(tenant);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_ip_range ON firewall_rules(ip_range);

-- ============================================================
-- FIREWALL_SETTINGS TABLE
-- ============================================================
-- Firewall configuration (mode, iptables integration, etc.)

-- Use settings table instead, with these keys:
-- - firewall.enabled: Boolean (default: false, backward compatible)
-- - firewall.mode: "whitelist" | "blacklist" (default: "whitelist")
-- - firewall.iptables_enabled: Boolean (default: false, Linux only)
-- - firewall.iptables_chain: String (default: "INPUT")
-- - firewall.iptables_sudo: Boolean (default: false)

-- ============================================================
-- DESIGN DECISIONS
-- ============================================================
-- 1. ip_range: Supports both single IPs and CIDR notation
--    - Single IP: "192.168.1.100"
--    - CIDR: "192.168.1.0/24"
--    - IPv6: "2001:db8::/32"
--
-- 2. rule_type: "allow" vs "deny"
--    - Whitelist mode: Only "allow" rules processed, deny everything else
--    - Blacklist mode: Only "deny" rules processed, allow everything else
--
-- 3. enabled: Soft disable without deleting rules
--    Allows temporary disable for testing
--
-- 4. Multi-tenancy: Tenant-specific firewall rules
--    NULL = global rules applied to all tenants
--
-- 5. No priority/order: Rules are OR-ed, first match wins
--    More specific rules (single IP) checked before broader (CIDR)
--
-- ============================================================
-- MIGRATION FROM v2.x
-- ============================================================
-- Old format (.mcp-gateway.json):
--   {
--     "auth": {
--       "ipAllowlist": ["192.168.1.0/24", "10.0.0.1"]
--     }
--   }
--
-- New format (firewall_rules table):
--   INSERT INTO firewall_rules (id, ip_range, rule_type, enabled)
--   VALUES (uuid(), "192.168.1.0/24", "allow", 1);
--
-- Migration handled by server/src/security/firewall/migration.ts
--
-- ============================================================
-- SECURITY CONSIDERATIONS
-- ============================================================
-- 1. IP spoofing prevention: Express trust proxy configuration
--    Always use req.ip (resolves X-Forwarded-For correctly)
--
-- 2. CIDR validation: Validate CIDR notation before INSERT
--    Use ipaddr.js library for parsing and validation
--
-- 3. Performance: Cache compiled CIDR ranges in memory
--    Avoid parsing CIDR on every request (< 1ms overhead target)
--
-- 4. Audit logging: Log all firewall rule changes
--    INSERT -> audit_log (action='CREATE', resource_type='firewall_rule')
--
-- 5. Bypass prevention: Apply firewall BEFORE auth middleware
--    Order: firewall -> CORS -> auth -> routes
--
-- ============================================================
-- EXAMPLE RULES
-- ============================================================
-- Allow private network ranges:
--   INSERT INTO firewall_rules (id, ip_range, rule_type, description)
--   VALUES
--     (uuid(), '192.168.0.0/16', 'allow', 'Private network'),
--     (uuid(), '10.0.0.0/8', 'allow', 'Private network'),
--     (uuid(), '172.16.0.0/12', 'allow', 'Private network');
--
-- Deny specific malicious IP:
--   INSERT INTO firewall_rules (id, ip_range, rule_type, description)
--   VALUES (uuid(), '203.0.113.42', 'deny', 'Known attacker');
--
-- Allow localhost (IPv4 + IPv6):
--   INSERT INTO firewall_rules (id, ip_range, rule_type, description)
--   VALUES
--     (uuid(), '127.0.0.1', 'allow', 'Localhost IPv4'),
--     (uuid(), '::1', 'allow', 'Localhost IPv6');
--
-- ============================================================
-- END OF MIGRATION
-- ============================================================
