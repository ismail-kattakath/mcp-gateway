# Changelog

## [3.0.0](https://github.com/ismail-kattakath/mcp-gateway/compare/v2.0.0...v3.0.0) (2026-06-09)

### ⚠ BREAKING CHANGES

- **storage**: Server configurations now stored in SQLite database by default instead of registry.json. Auto-migration runs on first startup with registry.json. See docs/MIGRATION_V2_TO_V3.md for upgrade guide.

### Features

- **storage**: implement database-first server configuration storage ([#240](https://github.com/ismail-kattakath/mcp-gateway/pull/240)) ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
  - Replace registry.json file-based storage with SQLite database
  - Auto-migrate registry.json to database on first startup
  - REST API operations persist directly to database
  - Backward compatibility via file-based mode (MCP_REGISTRY_SOURCE=file)
- **cli**: add api-client utility for audit commands ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **docs**: add comprehensive documentation and training materials ([f985b1f](https://github.com/ismail-kattakath/mcp-gateway/commit/f985b1f))
- **migration**: add v2.x to v3.0 migration tools and compatibility layer ([d4d97db](https://github.com/ismail-kattakath/mcp-gateway/commit/d4d97db))
- **deployment**: add production deployment configurations ([cc9856d](https://github.com/ismail-kattakath/mcp-gateway/commit/cc9856d))
- **security**: implement comprehensive security hardening ([5ab09d4](https://github.com/ismail-kattakath/mcp-gateway/commit/5ab09d4))
- **audit**: implement comprehensive audit logging for security events ([affcf05](https://github.com/ismail-kattakath/mcp-gateway/commit/affcf05))
- **auth**: add Kerberos and mTLS authentication support ([a69495c](https://github.com/ismail-kattakath/mcp-gateway/commit/a69495c))
- **performance**: implement HTTP/2 and comprehensive performance optimizations ([6b53472](https://github.com/ismail-kattakath/mcp-gateway/commit/6b53472))
- **auth**: add LDAP/Active Directory authentication integration ([b3be78c](https://github.com/ismail-kattakath/mcp-gateway/commit/b3be78c))
- **cli**: migrate CLI to oclif framework ([0d67e60](https://github.com/ismail-kattakath/mcp-gateway/commit/0d67e60))
- **security**: implement network security firewall ([f54785a](https://github.com/ismail-kattakath/mcp-gateway/commit/f54785a))
- **auth**: implement SAML 2.0 SSO with Okta, Azure AD, and generic IdP support ([dfd27d3](https://github.com/ismail-kattakath/mcp-gateway/commit/dfd27d3))
- **tracing**: add distributed tracing with OpenTelemetry ([3156e14](https://github.com/ismail-kattakath/mcp-gateway/commit/3156e14))

### Bug Fixes

- **docker**: upgrade Node.js base image to v22 to resolve npm vulnerabilities ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **security**: configure Trivy to not block on false positives ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **server**: resolve startup issues (helmet, JWT strategy, schema.sql) ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **ci**: fix security headers check and Docker build workflows ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **tests**: fix API routes tests for database-first implementation ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
- **deps**: upgrade dependencies to resolve security vulnerabilities ([4ee7cb7](https://github.com/ismail-kattakath/mcp-gateway/commit/4ee7cb747ea584ead062b35fc4504f07c285ce22))
  - Upgrade @node-saml/passport-saml 4→5 (critical SAML auth bypass)
  - Upgrade @opentelemetry/sdk-node 0.54→0.218 (high Prometheus crash)
  - Upgrade vite 5→7 and vitest 1→3 (critical UI server arbitrary file read CVE)

### Documentation

- **migration**: add comprehensive v2.x to v3.0 migration guide ([d4d97db](https://github.com/ismail-kattakath/mcp-gateway/commit/d4d97db))
- **deployment**: add Kubernetes, Helm, Docker Compose guides ([cc9856d](https://github.com/ismail-kattakath/mcp-gateway/commit/cc9856d))
- **security**: add security hardening documentation ([5ab09d4](https://github.com/ismail-kattakath/mcp-gateway/commit/5ab09d4))
- **audit**: add audit logging documentation ([affcf05](https://github.com/ismail-kattakath/mcp-gateway/commit/affcf05))

---

## [2.0.0](https://github.com/ismail-kattakath/mcp-gateway/compare/v1.1.0...v2.0.0) (2026-06-08)

Initial production release with comprehensive enterprise features.
