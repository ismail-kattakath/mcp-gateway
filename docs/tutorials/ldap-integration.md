# Tutorial: LDAP/Active Directory Integration

Authenticate MCP Gateway users against corporate LDAP/AD directory.

## Overview

**What you'll learn:**

- Connect to LDAP/AD server
- Configure user authentication
- Map LDAP groups to MCP Gateway roles
- Implement secure LDAPS connection

**Prerequisites:**

- MCP Gateway v3.0+
- LDAP or Active Directory server
- Network access to LDAP port (389 or 636)
- LDAP admin credentials

**Time:** 25 minutes

## Architecture

```
User → Gateway → LDAP Bind → AD/LDAP → Verify Credentials → Grant Access
```

## Step 1: Prepare LDAP Server

### 1.1 Create Service Account

Create a read-only service account for LDAP queries:

**Active Directory:**

```
Distinguished Name: CN=MCP Gateway Service,OU=ServiceAccounts,DC=corp,DC=example,DC=com
Password: (strong password)
Permissions: Read-only access to Users OU
```

**OpenLDAP:**

```
dn: cn=mcp-gateway,ou=services,dc=example,dc=com
objectClass: simpleSecurityObject
cn: mcp-gateway
userPassword: {SSHA}...
```

### 1.2 Configure Groups

Create groups for role mapping:

```
CN=MCP-Admins,OU=Groups,DC=corp,DC=example,DC=com
CN=MCP-Developers,OU=Groups,DC=corp,DC=example,DC=com
CN=MCP-ReadOnly,OU=Groups,DC=corp,DC=example,DC=com
```

### 1.3 Test Connectivity

```bash
# Test LDAP connection
ldapsearch -x -H ldap://ldap.example.com:389 \
  -D "cn=admin,dc=example,dc=com" \
  -w password \
  -b "dc=example,dc=com" \
  "(uid=testuser)"

# Test LDAPS (secure)
ldapsearch -x -H ldaps://ldap.example.com:636 \
  -D "cn=admin,dc=example,dc=com" \
  -w password \
  -b "dc=example,dc=com" \
  "(uid=testuser)"
```

## Step 2: Configure MCP Gateway

### 2.1 Store LDAP Credentials

```bash
mcp secrets set LDAP_BIND_DN "cn=mcp-gateway,ou=services,dc=example,dc=com"
mcp secrets set LDAP_BIND_PASSWORD "secure-password"
```

### 2.2 Create LDAP Configuration

**For OpenLDAP:**

```json
{
  "authentication": {
    "strategies": ["ldap", "api-key"],
    "ldap": {
      "enabled": true,
      "url": "ldaps://ldap.example.com:636",
      "bindDN": "${SECRET:LDAP_BIND_DN}",
      "bindCredentials": "${SECRET:LDAP_BIND_PASSWORD}",
      "searchBase": "ou=users,dc=example,dc=com",
      "searchFilter": "(uid={{username}})",
      "searchAttributes": ["uid", "mail", "cn", "memberOf"],
      "groupSearchBase": "ou=groups,dc=example,dc=com",
      "groupSearchFilter": "(member={{dn}})",
      "groupAttribute": "cn",
      "tlsOptions": {
        "rejectUnauthorized": true,
        "ca": "/etc/ssl/certs/ca.pem"
      },
      "groupRoleMapping": {
        "mcp-admins": "admin",
        "mcp-developers": "developer",
        "mcp-readonly": "readonly"
      }
    }
  }
}
```

**For Active Directory:**

```json
{
  "authentication": {
    "strategies": ["ldap", "api-key"],
    "ldap": {
      "enabled": true,
      "url": "ldaps://dc.corp.example.com:636",
      "bindDN": "${SECRET:LDAP_BIND_DN}",
      "bindCredentials": "${SECRET:LDAP_BIND_PASSWORD}",
      "searchBase": "ou=Users,dc=corp,dc=example,dc=com",
      "searchFilter": "(&(objectClass=user)(sAMAccountName={{username}}))",
      "searchAttributes": ["sAMAccountName", "mail", "displayName", "memberOf"],
      "groupSearchBase": "ou=Groups,dc=corp,dc=example,dc=com",
      "groupSearchFilter": "(&(objectClass=group)(member={{dn}}))",
      "groupAttribute": "cn",
      "tlsOptions": {
        "rejectUnauthorized": true
      },
      "attributeMapping": {
        "username": "sAMAccountName",
        "email": "mail",
        "name": "displayName"
      },
      "groupRoleMapping": {
        "MCP-Admins": "admin",
        "MCP-Developers": "developer",
        "MCP-ReadOnly": "readonly"
      }
    }
  }
}
```

### 2.3 Restart Gateway

```bash
docker restart mcp-gateway
```

## Step 3: Test Authentication

### 3.1 Login with LDAP Credentials

```bash
curl -X POST https://gateway.example.com/auth/ldap/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "password": "user-password"
  }'
```

Response:

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "...",
  "user": {
    "username": "alice",
    "email": "alice@example.com",
    "roles": ["developer"]
  }
}
```

### 3.2 Verify Group Mapping

```bash
mcp users get alice --format json
```

Should show roles based on LDAP group membership.

## Troubleshooting

**Issue: "Connection refused"**

Check firewall and LDAP port:

```bash
telnet ldap.example.com 636
```

**Issue: "Bind failed"**

Verify service account credentials:

```bash
ldapsearch -x -H ldaps://ldap.example.com:636 \
  -D "${LDAP_BIND_DN}" \
  -w "${LDAP_BIND_PASSWORD}" \
  -b "dc=example,dc=com" \
  "(objectClass=*)"
```

**Issue: "User not found"**

Check search filter:

```bash
mcp logs --filter ldap --level debug
```

## Security Best Practices

1. **Use LDAPS (port 636)** - Never use plain LDAP in production
2. **Service Account Permissions** - Read-only access only
3. **TLS Certificate Validation** - Set `rejectUnauthorized: true`
4. **Password Policies** - Enforce strong passwords in AD/LDAP
5. **Connection Pooling** - Reuse connections for performance

## Advanced Configuration

### Connection Pooling

```json
{
  "ldap": {
    "connectionPool": {
      "min": 2,
      "max": 10,
      "idleTimeoutMillis": 30000
    }
  }
}
```

### Nested Group Support

```json
{
  "ldap": {
    "groupSearchScope": "sub",
    "nestedGroups": true
  }
}
```

### Failover Servers

```json
{
  "ldap": {
    "servers": [
      "ldaps://dc1.corp.example.com:636",
      "ldaps://dc2.corp.example.com:636"
    ],
    "failoverDelay": 5000
  }
}
```

## Next Steps

- [Kubernetes Deployment](kubernetes-deployment.md)
- [Multi-Tenancy Setup](multi-tenancy.md)
- [Monitoring Setup](monitoring-setup.md)
