# LDAP/Active Directory Integration

Complete guide for integrating LDAP and Active Directory authentication with MCP Gateway.

**Related:** Epic #20 (LDAP/AD Integration)

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Configuration](#configuration)
6. [Active Directory](#active-directory)
7. [Group Mapping](#group-mapping)
8. [JIT User Provisioning](#jit-user-provisioning)
9. [CLI Commands](#cli-commands)
10. [API Endpoints](#api-endpoints)
11. [Troubleshooting](#troubleshooting)
12. [Security Considerations](#security-considerations)

---

## Overview

MCP Gateway supports LDAP/Active Directory authentication with:

- **Connection pooling** for performance
- **Just-In-Time (JIT) user provisioning**
- **Group-based role mapping** (LDAP groups → RBAC roles)
- **Nested group resolution** for Active Directory
- **Multiple domain controller support** for failover
- **TLS/LDAPS** support

**Authentication flow:**

1. User submits username/password to `/auth/ldap/:provider/login`
2. Gateway binds to LDAP server with service account (if configured)
3. Searches for user entry using search filter
4. Authenticates by binding with user credentials
5. Extracts user attributes and groups
6. Maps groups to RBAC roles
7. Creates or updates user in database (JIT provisioning)
8. Returns JWT access token and refresh token

---

## Features

### ✅ Supported LDAP Servers

- **OpenLDAP** - Open-source LDAP server
- **Active Directory** - Microsoft's directory service
- **FreeIPA** - Red Hat identity management
- **389 Directory Server** - Enterprise LDAP server
- **Any RFC 4511-compliant LDAP server**

### ✅ Authentication Methods

- **Anonymous bind** - No service account required (rare)
- **Simple bind** - Service account with DN and password
- **User bind** - Authenticate as user directly
- **TLS/LDAPS** - Encrypted connections

### ✅ Connection Management

- **Connection pooling** - Reuse connections for performance
- **Health checks** - Auto-detect connection failures
- **Auto-reconnect** - Recover from transient failures
- **Configurable timeouts** - Prevent hanging connections

### ✅ User Provisioning

- **JIT provisioning** - Create users on first login
- **Account linking** - Link LDAP to existing email accounts
- **Attribute mapping** - Map LDAP attributes to user fields
- **Group-based roles** - Automatic role assignment
- **Deprovisioning** - Disable users on auth failure

---

## Prerequisites

### LDAP Server Requirements

- LDAP server accessible from gateway (network connectivity)
- Service account with read access to user base DN (recommended)
- User attributes populated (uid/sAMAccountName, mail, memberOf)
- TLS/LDAPS enabled (recommended for production)

### Gateway Requirements

- MCP Gateway v2.1.0+ with Epic #20 support
- Database with LDAP migrations applied (003_add_ldap.sql)
- Node.js 18+ with ldapjs package installed

---

## Quick Start

### Step 1: Add LDAP Provider

#### OpenLDAP

```bash
mcp ldap add openldap \
  --url ldap://ldap.example.com:389 \
  --bind-dn "cn=admin,dc=example,dc=com" \
  --bind-password "secret" \
  --base-dn "ou=users,dc=example,dc=com" \
  --search-filter "(uid={{username}})" \
  --attribute-mapping '{"username":"uid","email":"mail","fullName":"cn","groups":"memberOf"}' \
  --group-mapping '{"CN=Admins,OU=Groups,DC=example,DC=com":"admin","default":"user"}' \
  --registry /path/to/registry.json
```

#### Active Directory

```bash
mcp ldap add ad \
  --url ldaps://dc1.corp.example.com:636 \
  --bind-dn "CN=Service Account,OU=Services,DC=corp,DC=example,DC=com" \
  --bind-password "secret" \
  --base-dn "OU=Users,DC=corp,DC=example,DC=com" \
  --search-filter "(&(objectClass=user)(sAMAccountName={{username}}))" \
  --attribute-mapping '{"username":"sAMAccountName","email":"mail","fullName":"displayName","groups":"memberOf"}' \
  --group-mapping '{"CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com":"admin","default":"user"}' \
  --registry /path/to/registry.json
```

### Step 2: Test Authentication

```bash
mcp ldap test ad \
  --username jdoe \
  --password test123 \
  --registry /path/to/registry.json
```

### Step 3: Authenticate via API

```bash
curl -X POST http://localhost:3000/auth/ldap/ad/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jdoe",
    "password": "test123"
  }'
```

**Response:**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123...",
  "expiresIn": 900,
  "user": {
    "id": "uuid-here",
    "username": "jdoe",
    "email": "jdoe@example.com",
    "role": "user",
    "tenant": null
  }
}
```

---

## Configuration

### Provider Configuration

#### Required Fields

| Field     | Description               | Example                                       |
| --------- | ------------------------- | --------------------------------------------- |
| `name`    | Unique provider name      | `"openldap"`, `"ad"`                          |
| `url`     | LDAP server URL           | `"ldap://server:389"`, `"ldaps://server:636"` |
| `base_dn` | Base DN for user searches | `"ou=users,dc=example,dc=com"`                |

#### Optional Fields

| Field                     | Default                | Description                  |
| ------------------------- | ---------------------- | ---------------------------- |
| `bind_dn`                 | `null`                 | Service account DN           |
| `bind_password`           | `null`                 | Service account password     |
| `search_filter`           | `"(uid={{username}})"` | LDAP search filter           |
| `attribute_mapping`       | `{}`                   | Attribute mapping (JSON)     |
| `group_mapping`           | `{"default":"user"}`   | Group to role mapping (JSON) |
| `tls_enabled`             | `true`                 | Enable TLS/LDAPS             |
| `tls_reject_unauthorized` | `true`                 | Validate TLS certificate     |
| `pool_size`               | `5`                    | Connection pool size         |
| `timeout`                 | `10000`                | Connection timeout (ms)      |
| `enabled`                 | `true`                 | Enable provider              |

#### Search Filters

The search filter supports `{{username}}` template variable:

**OpenLDAP:**

```ldap
(uid={{username}})
```

**Active Directory (sAMAccountName):**

```ldap
(&(objectClass=user)(sAMAccountName={{username}}))
```

**Active Directory (userPrincipalName):**

```ldap
(&(objectClass=user)(userPrincipalName={{username}}@example.com))
```

**Multiple criteria:**

```ldap
(|(uid={{username}})(mail={{username}}@example.com))
```

#### Attribute Mapping

Maps LDAP attributes to user model fields:

```json
{
  "username": "uid", // or "sAMAccountName" for AD
  "email": "mail",
  "fullName": "cn", // or "displayName" for AD
  "firstName": "givenName",
  "lastName": "sn",
  "groups": "memberOf"
}
```

**Common LDAP Attributes:**

| Field      | OpenLDAP    | Active Directory |
| ---------- | ----------- | ---------------- |
| Username   | `uid`       | `sAMAccountName` |
| Email      | `mail`      | `mail`           |
| Full Name  | `cn`        | `displayName`    |
| First Name | `givenName` | `givenName`      |
| Last Name  | `sn`        | `sn`             |
| Groups     | `memberOf`  | `memberOf`       |

#### Group Mapping

Maps LDAP group DNs to RBAC roles:

```json
{
  "CN=Admins,OU=Groups,DC=example,DC=com": "admin",
  "CN=Developers,OU=Groups,DC=example,DC=com": "user",
  "CN=Viewers,OU=Groups,DC=example,DC=com": "readonly",
  "default": "readonly"
}
```

**Note:** Group DNs are case-insensitive. First matching group wins.

---

## Active Directory

### Configuration Presets

Active Directory requires specific search filters and attribute mappings:

**sAMAccountName (Windows username):**

```bash
--search-filter "(&(objectClass=user)(sAMAccountName={{username}}))"
--attribute-mapping '{"username":"sAMAccountName","email":"mail","fullName":"displayName","groups":"memberOf"}'
```

**userPrincipalName (email format):**

```bash
--search-filter "(&(objectClass=user)(userPrincipalName={{username}}))"
--attribute-mapping '{"username":"userPrincipalName","email":"mail","fullName":"displayName","groups":"memberOf"}'
```

### Nested Groups

Active Directory supports transitive group membership. Gateway automatically resolves nested groups using the `memberOf` attribute.

**Example:**

- User is member of `CN=Developers,OU=Groups,DC=corp,DC=com`
- `CN=Developers` is member of `CN=All Users,OU=Groups,DC=corp,DC=com`
- Both groups are included in role mapping

### Domain Controller Failover

Support multiple domain controllers for high availability:

```bash
--url ldaps://dc1.corp.example.com:636,dc2.corp.example.com:636,dc3.corp.example.com:636
```

Gateway tries each DC in order until one succeeds.

### Global Catalog

For multi-domain forests, use Global Catalog (port 3268/3269):

```bash
--url ldaps://gc.corp.example.com:3269
--base-dn "DC=corp,DC=example,DC=com"
```

---

## Group Mapping

### Mapping Strategy

1. User authenticates successfully
2. Extract `memberOf` attribute (list of group DNs)
3. Resolve nested groups (for AD)
4. Check each group against mapping (first match wins)
5. Assign mapped role, or default role if no match

### Case Sensitivity

Group DNs are **case-insensitive**:

```json
{
  "cn=admins,ou=groups,dc=example,dc=com": "admin"
}
```

Matches:

- `CN=Admins,OU=Groups,DC=example,DC=com`
- `cn=admins,ou=groups,dc=example,dc=com`
- `Cn=Admins,Ou=Groups,Dc=example,Dc=com`

### Priority Order

Groups are checked in JSON object order. **First match wins.**

```json
{
  "CN=Super Admins,OU=Groups,DC=example,DC=com": "admin",
  "CN=Admins,OU=Groups,DC=example,DC=com": "admin",
  "CN=Developers,OU=Groups,DC=example,DC=com": "user",
  "default": "readonly"
}
```

### Regex Not Supported

Group mapping uses **exact DN matching** only. Wildcards and regex are not supported.

For dynamic group mapping, use domain-based mapping:

```json
{
  "@example.com": "user",
  "@admin.example.com": "admin",
  "default": "readonly"
}
```

---

## JIT User Provisioning

### Provisioning Flow

**Step 1: Check existing user by LDAP DN**

```sql
SELECT * FROM users WHERE ldap_provider = ? AND ldap_dn = ?
```

**Step 2: If not found, check by email**

```sql
SELECT * FROM users WHERE email = ?
```

**Step 3: Create new user or link existing**

- **If found by DN:** Update role and last login
- **If found by email:** Link LDAP account
- **If not found:** Create new user with JIT provisioning

**Step 4: Apply role mapping**

- Map LDAP groups to RBAC roles
- Assign role (admin/user/readonly)

**Step 5: Log authentication**

Store audit log in `ldap_auth_logs` table.

### Account Linking

When user authenticates via LDAP for the first time, gateway checks if user exists by email. If found, LDAP account is linked:

```sql
UPDATE users
SET ldap_provider = ?, ldap_dn = ?, role = ?, updated_at = ?
WHERE id = ?
```

This allows seamless migration from password-based auth to LDAP.

### Password Field

LDAP users have placeholder password hash `<ldap>` and **cannot authenticate via password**. They must use LDAP authentication.

### Deprovisioning

When LDAP user fails authentication (account disabled, password changed, etc.), gateway logs failure but does **not** automatically disable user account.

To disable LDAP users, use:

```bash
mcp role update <username> --status inactive
```

---

## CLI Commands

### Add Provider

```bash
mcp ldap add <name> [options]
  --url <url>                    LDAP server URL (required)
  --base-dn <baseDn>            Base DN for user searches (required)
  --bind-dn <bindDn>            Service account DN (optional)
  --bind-password <password>    Service account password (optional)
  --search-filter <filter>      Search filter (default: (uid={{username}}))
  --attribute-mapping <json>    Attribute mapping (JSON)
  --group-mapping <json>        Group mapping (JSON)
  --tls-enabled <boolean>       Enable TLS (default: true)
  --tls-reject-unauthorized <boolean>  Validate TLS cert (default: true)
  --pool-size <number>          Connection pool size (default: 5)
  --timeout <number>            Timeout in ms (default: 10000)
  --enabled <boolean>           Enable provider (default: true)
  --registry <path>             Path to registry.json (required)
```

### Update Provider

```bash
mcp ldap update <name> [options]
  --url <url>                    LDAP server URL
  --base-dn <baseDn>            Base DN
  --bind-dn <bindDn>            Service account DN
  --bind-password <password>    Service account password
  --search-filter <filter>      Search filter
  --attribute-mapping <json>    Attribute mapping
  --group-mapping <json>        Group mapping
  --tls-enabled <boolean>       Enable TLS
  --tls-reject-unauthorized <boolean>  Validate TLS cert
  --pool-size <number>          Connection pool size
  --timeout <number>            Timeout in ms
  --enabled <boolean>           Enable/disable provider
  --registry <path>             Path to registry.json (required)
```

### Remove Provider

```bash
mcp ldap remove <name> [options]
  --registry <path>   Path to registry.json (required)
  --yes               Skip confirmation prompt
```

### List Providers

```bash
mcp ldap list [options]
  --registry <path>   Path to registry.json (required)
  --json              Output as JSON
```

### Test Authentication

```bash
mcp ldap test <name> [options]
  --username <username>   Username to test (required)
  --password <password>   Password to test (required)
  --registry <path>       Path to registry.json (required)
```

---

## API Endpoints

All endpoints require Bearer token authentication.

### List Providers

```http
GET /api/ldap/providers
Authorization: Bearer <token>
```

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "openldap",
    "url": "ldap://server:389",
    "base_dn": "ou=users,dc=example,dc=com",
    "enabled": true,
    ...
  }
]
```

### Get Provider

```http
GET /api/ldap/providers/:name
Authorization: Bearer <token>
```

### Create Provider

```http
POST /api/ldap/providers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "openldap",
  "url": "ldap://server:389",
  "base_dn": "ou=users,dc=example,dc=com",
  ...
}
```

### Update Provider

```http
PUT /api/ldap/providers/:name
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

### Delete Provider

```http
DELETE /api/ldap/providers/:name
Authorization: Bearer <token>
```

### Authenticate

```http
POST /auth/ldap/:provider/login
Content-Type: application/json

{
  "username": "jdoe",
  "password": "secret"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "username": "jdoe",
    "email": "jdoe@example.com",
    "role": "user"
  }
}
```

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to LDAP server

**Solutions:**

- Check network connectivity: `telnet ldap.example.com 389`
- Verify firewall rules allow outbound LDAP traffic
- Check LDAP server logs for errors
- Try anonymous bind first (no bind_dn/bind_password)

### Authentication Failures

**Problem:** Authentication always fails

**Solutions:**

- Test with `ldapsearch` command: `ldapsearch -x -H ldap://server -D "cn=admin,dc=example,dc=com" -W -b "ou=users,dc=example,dc=com" "(uid=jdoe)"`
- Verify search filter matches user entries
- Check bind DN and password are correct
- Verify base DN is correct
- Check user account is not disabled/locked

### TLS/LDAPS Issues

**Problem:** TLS connection fails

**Solutions:**

- Verify LDAPS port (636) is accessible
- Check TLS certificate is valid
- Disable certificate validation temporarily: `--tls-reject-unauthorized false`
- Import CA certificate to system trust store

### Group Mapping Issues

**Problem:** Users get wrong role

**Solutions:**

- Check `memberOf` attribute is populated: `ldapsearch ... "(uid=jdoe)" memberOf`
- Verify group DNs match exactly (case-insensitive)
- Check group mapping order (first match wins)
- Enable debug logging: `LOG_LEVEL=debug npm start`

### Performance Issues

**Problem:** Slow authentication

**Solutions:**

- Increase connection pool size: `--pool-size 10`
- Reduce timeout: `--timeout 5000`
- Use LDAPS instead of StartTLS
- Add indexes to LDAP server (uid, mail, memberOf)

---

## Security Considerations

### Transport Security

**Always use TLS/LDAPS in production:**

```bash
--url ldaps://ldap.example.com:636
--tls-enabled true
--tls-reject-unauthorized true
```

### Service Account

**Use read-only service account:**

- Grant minimal permissions (read-only to user base DN)
- Rotate password regularly
- Store password securely (use environment variables or secret manager)

### Input Validation

Gateway automatically escapes LDAP special characters in usernames to prevent LDAP injection:

```
user*()\ → user\2a\28\29\5c
```

### Password Storage

LDAP users have placeholder password hash `<ldap>` and cannot authenticate via password. This prevents credential stuffing attacks.

### Audit Logging

All authentication attempts are logged to `ldap_auth_logs` table:

```sql
SELECT * FROM ldap_auth_logs
WHERE username = 'jdoe'
ORDER BY created_at DESC
LIMIT 10;
```

### Rate Limiting

Consider adding rate limiting to `/auth/ldap/:provider/login` endpoint to prevent brute force attacks.

---

## Example Configurations

### OpenLDAP (Anonymous Bind)

```bash
mcp ldap add openldap \
  --url ldap://ldap.example.com:389 \
  --base-dn "ou=users,dc=example,dc=com" \
  --search-filter "(uid={{username}})" \
  --attribute-mapping '{"username":"uid","email":"mail","fullName":"cn"}' \
  --group-mapping '{"default":"user"}' \
  --registry /path/to/registry.json
```

### Active Directory (Single DC)

```bash
mcp ldap add ad \
  --url ldaps://dc.corp.example.com:636 \
  --bind-dn "CN=LDAP Service,OU=Service Accounts,DC=corp,DC=example,DC=com" \
  --bind-password "${LDAP_PASSWORD}" \
  --base-dn "OU=Users,DC=corp,DC=example,DC=com" \
  --search-filter "(&(objectClass=user)(sAMAccountName={{username}}))" \
  --attribute-mapping '{"username":"sAMAccountName","email":"mail","fullName":"displayName","groups":"memberOf"}' \
  --group-mapping '{"CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com":"admin","CN=Domain Users,CN=Users,DC=corp,DC=example,DC=com":"user","default":"readonly"}' \
  --registry /path/to/registry.json
```

### FreeIPA

```bash
mcp ldap add freeipa \
  --url ldaps://ipa.example.com:636 \
  --bind-dn "uid=ldapservice,cn=users,cn=accounts,dc=example,dc=com" \
  --bind-password "${LDAP_PASSWORD}" \
  --base-dn "cn=users,cn=accounts,dc=example,dc=com" \
  --search-filter "(uid={{username}})" \
  --attribute-mapping '{"username":"uid","email":"mail","fullName":"cn","groups":"memberOf"}' \
  --group-mapping '{"cn=admins,cn=groups,cn=accounts,dc=example,dc=com":"admin","default":"user"}' \
  --registry /path/to/registry.json
```

---

## Related Documentation

- [Authentication Framework (Epic #4)](../server/src/auth/README.md)
- [RBAC System (Epic #17)](../server/src/rbac/README.md)
- [SAML SSO (Epic #19)](./SAML.md)
- [API Reference](./API.md)

---

**Last Updated:** 2026-06-09  
**Version:** 2.1.0  
**Epic:** #20 (LDAP/AD Integration)
