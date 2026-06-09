# Tutorial: Multi-Tenancy Setup

Configure MCP Gateway for multiple tenants with isolated resources.

## Overview

**What you'll learn:**

- Enable multi-tenancy mode
- Create and manage tenants
- Implement tenant isolation
- Configure per-tenant quotas
- Set up tenant-specific authentication

**Prerequisites:**

- MCP Gateway v3.0+
- PostgreSQL database (required for multi-tenancy)
- Admin access

**Time:** 30 minutes

## Architecture

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Tenant A │  │ Tenant B │  │ Tenant C │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  │
            ┌─────┴─────┐
            │    MCP    │
            │  Gateway  │
            └─────┬─────┘
                  │
     ┌────────────┼────────────┐
     │            │            │
┌────┴────┐  ┌───┴────┐  ┌────┴────┐
│Tenant A │  │Tenant B│  │Tenant C │
│Database │  │Database│  │Database │
└─────────┘  └────────┘  └─────────┘
```

## Step 1: Enable Multi-Tenancy

### 1.1 Update Configuration

Edit `config.json`:

```json
{
  "multiTenancy": {
    "enabled": true,
    "isolation": "strict",
    "defaultTenant": "default",
    "storage": {
      "type": "postgres",
      "perTenant": true
    }
  }
}
```

**Isolation modes:**

- `strict`: Complete isolation, no cross-tenant access
- `soft`: Isolation with opt-in sharing
- `none`: Single-tenant mode

### 1.2 Restart Gateway

```bash
docker restart mcp-gateway
```

## Step 2: Create Tenants

### 2.1 Create First Tenant

```bash
mcp tenants create acme-corp \
  --name "Acme Corporation" \
  --contact admin@acme.com \
  --quota-servers 10 \
  --quota-users 50 \
  --quota-storage 10GB
```

### 2.2 Create Additional Tenants

```bash
mcp tenants create widgets-inc \
  --name "Widgets Inc" \
  --contact admin@widgets.com

mcp tenants create global-services \
  --name "Global Services Ltd" \
  --contact admin@global.com
```

### 2.3 List Tenants

```bash
mcp tenants list
```

Output:

```
ID               Name                     Users  Servers  Status
acme-corp        Acme Corporation         5      3        active
widgets-inc      Widgets Inc              2      1        active
global-services  Global Services Ltd      10     5        active
```

## Step 3: Configure Tenant Resources

### 3.1 Create Tenant-Specific Registry

```bash
# Switch to tenant context
mcp context set-tenant acme-corp

# Create servers for tenant
mcp servers create filesystem \
  --source pkg \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-filesystem" "/data/acme"
```

Or create tenant-specific registry file:

```json
{
  "version": "3.0",
  "tenant": "acme-corp",
  "servers": {
    "filesystem": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data/acme"]
    },
    "custom-server": {
      "source": "local",
      "command": "/opt/acme/custom-server",
      "args": ["--tenant", "acme-corp"]
    }
  }
}
```

### 3.2 Set Resource Quotas

```bash
mcp tenants update acme-corp \
  --quota-servers 20 \
  --quota-users 100 \
  --quota-tool-calls 10000 \
  --quota-storage 50GB \
  --quota-bandwidth 100GB
```

### 3.3 Create Tenant Users

```bash
# Create admin user for tenant
mcp users create alice \
  --tenant acme-corp \
  --email alice@acme.com \
  --role admin

# Create regular users
mcp users create bob \
  --tenant acme-corp \
  --email bob@acme.com \
  --role user
```

## Step 4: Implement Network Isolation

### 4.1 Configure Firewall Rules

```json
{
  "multiTenancy": {
    "networkIsolation": {
      "enabled": true,
      "firewallRules": [
        {
          "tenant": "acme-corp",
          "allowedIPs": ["192.168.1.0/24"],
          "deniedIPs": []
        },
        {
          "tenant": "widgets-inc",
          "allowedIPs": ["10.0.0.0/8"],
          "deniedIPs": []
        }
      ]
    }
  }
}
```

### 4.2 Configure VLANs (Advanced)

```json
{
  "multiTenancy": {
    "networkIsolation": {
      "vlan": true,
      "vlanMapping": {
        "acme-corp": 100,
        "widgets-inc": 101,
        "global-services": 102
      }
    }
  }
}
```

## Step 5: Storage Isolation

### 5.1 Per-Tenant Databases

```json
{
  "multiTenancy": {
    "storage": {
      "type": "postgres",
      "perTenant": true,
      "connectionTemplate": "postgresql://user:pass@host:5432/mcp_{tenant_id}"
    }
  }
}
```

### 5.2 Shared Database with Row-Level Security

```sql
-- Enable RLS
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON servers
  USING (tenant_id = current_setting('app.current_tenant')::text);

-- Set tenant context
SET app.current_tenant = 'acme-corp';
```

### 5.3 Separate Filesystem Paths

```json
{
  "multiTenancy": {
    "storage": {
      "filesystem": {
        "dataPath": "/data/tenants/${TENANT_ID}",
        "logsPath": "/logs/tenants/${TENANT_ID}",
        "tmpPath": "/tmp/tenants/${TENANT_ID}"
      }
    }
  }
}
```

## Step 6: Tenant-Specific Authentication

### 6.1 OAuth per Tenant

```json
{
  "authentication": {
    "perTenant": true,
    "tenants": {
      "acme-corp": {
        "strategies": ["oauth"],
        "oauth": {
          "provider": "okta",
          "clientId": "${ACME_OAUTH_CLIENT_ID}",
          "domain": "acme.okta.com"
        }
      },
      "widgets-inc": {
        "strategies": ["saml"],
        "saml": {
          "entryPoint": "https://widgets-sso.example.com",
          "issuer": "widgets-inc"
        }
      }
    }
  }
}
```

### 6.2 Custom Login Pages

```
https://gateway.example.com/auth/login?tenant=acme-corp
https://gateway.example.com/auth/login?tenant=widgets-inc
```

## Step 7: Monitoring and Billing

### 7.1 Track Resource Usage

```bash
# View tenant usage
mcp tenants stats acme-corp

# Export usage report
mcp tenants export acme-corp \
  --since "2024-01-01" \
  --until "2024-01-31" \
  --format csv
```

### 7.2 Configure Alerts

```json
{
  "multiTenancy": {
    "alerts": {
      "quotaWarning": 0.8,
      "quotaCritical": 0.95,
      "webhooks": [
        {
          "tenant": "acme-corp",
          "url": "https://acme.com/webhooks/mcp-alerts"
        }
      ]
    }
  }
}
```

## Troubleshooting

**Issue: Tenant cannot access resources**

Check tenant context:

```bash
mcp context get-tenant
mcp context set-tenant acme-corp
```

**Issue: Quota exceeded**

Increase quota:

```bash
mcp tenants update acme-corp --quota-servers 30
```

**Issue: Cross-tenant data leak**

Verify isolation:

```bash
mcp audit verify-isolation --tenant acme-corp
```

## Best Practices

1. **Strict Isolation** - Use `isolation: "strict"` in production
2. **Separate Databases** - One database per tenant for compliance
3. **Network Segmentation** - Use VLANs or firewall rules
4. **Quota Monitoring** - Set up alerts for quota thresholds
5. **Audit Logging** - Enable per-tenant audit logs
6. **Backup Strategy** - Per-tenant backup schedules

## Next Steps

- [Monitoring Setup](monitoring-setup.md)
- [Audit Logging](../AUDIT_LOGGING.md)
- [Security Hardening](../SECURITY_HARDENING.md)
