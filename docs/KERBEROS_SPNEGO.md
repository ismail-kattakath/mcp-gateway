# Kerberos/SPNEGO Authentication

This guide explains how to configure and use Kerberos/SPNEGO authentication in MCP Gateway for enterprise single sign-on (SSO) integration with Active Directory.

## Overview

Kerberos/SPNEGO (Simple and Protected GSSAPI Negotiation Mechanism) provides passwordless authentication by validating Kerberos tickets issued by a Key Distribution Center (KDC), typically Active Directory Domain Services.

**Key Features:**

- Passwordless authentication (no credentials sent over network)
- Windows Active Directory integration
- Just-in-time (JIT) user provisioning
- MIT Kerberos and Heimdal support
- Automatic ticket verification using service keytab

**Related Epic:** Epic #21 (Advanced Authentication - Kerberos/mTLS)

## Architecture

### Authentication Flow

```
1. Client obtains Kerberos ticket from KDC (e.g., Active Directory)
2. Client sends SPNEGO token in Authorization: Negotiate header
3. Gateway validates token using service keytab
4. Gateway extracts Kerberos principal (e.g., alice@EXAMPLE.COM)
5. Gateway provisions/updates user (JIT)
6. Gateway returns JWT access + refresh tokens
```

### Components

- **KDC (Key Distribution Center)**: Issues Kerberos tickets (typically Active Directory)
- **Service Principal**: Identifies gateway service (e.g., `HTTP/gateway.example.com@EXAMPLE.COM`)
- **Keytab File**: Contains service credentials for ticket verification
- **Realm**: Kerberos authentication domain (e.g., `EXAMPLE.COM`)

## Prerequisites

### 1. Kerberos Environment

**Active Directory:**

- Windows Active Directory Domain Controller
- Domain users can obtain Kerberos tickets
- Service account for gateway registration

**MIT Kerberos (Linux/Unix):**

```bash
# Install Kerberos client
sudo apt-get install krb5-user  # Debian/Ubuntu
sudo yum install krb5-workstation  # RHEL/CentOS

# Configure /etc/krb5.conf
[libdefaults]
    default_realm = EXAMPLE.COM
    dns_lookup_realm = false
    dns_lookup_kdc = true

[realms]
    EXAMPLE.COM = {
        kdc = kdc.example.com
        admin_server = kdc.example.com
    }

[domain_realm]
    .example.com = EXAMPLE.COM
    example.com = EXAMPLE.COM
```

### 2. Service Principal Name (SPN)

Register gateway service in Active Directory:

**Windows (PowerShell):**

```powershell
# Create service account
New-ADUser -Name "mcp-gateway" -SamAccountName "mcp-gateway" -Enabled $true

# Set service principal name
setspn -A HTTP/gateway.example.com mcp-gateway

# Export keytab (requires ktpass.exe from Windows Support Tools)
ktpass -princ HTTP/gateway.example.com@EXAMPLE.COM -mapuser mcp-gateway `
  -crypto AES256-SHA1 -ptype KRB5_NT_PRINCIPAL -pass * -out gateway.keytab
```

**Linux (kadmin):**

```bash
# Connect to KDC
kadmin -p admin/admin@EXAMPLE.COM

# Create service principal
kadmin: addprinc -randkey HTTP/gateway.example.com@EXAMPLE.COM

# Export keytab
kadmin: ktadd -k /etc/mcp-gateway/gateway.keytab HTTP/gateway.example.com@EXAMPLE.COM

kadmin: quit
```

### 3. Keytab File Security

**Critical Security Requirements:**

- Keytab file contains service credentials — protect like private keys
- File permissions: `0400` (readable only by gateway process)
- Store outside web root
- Never commit to version control

```bash
# Set correct permissions
sudo chown mcp-gateway:mcp-gateway /etc/mcp-gateway/gateway.keytab
sudo chmod 0400 /etc/mcp-gateway/gateway.keytab

# Verify permissions
ls -l /etc/mcp-gateway/gateway.keytab
# Expected: -r-------- 1 mcp-gateway mcp-gateway ... gateway.keytab
```

## Configuration

### 1. Database Configuration

Create Kerberos configuration record:

```sql
INSERT INTO kerberos_config (
  id,
  servicePrincipal,
  keytabPath,
  realm,
  enabled
) VALUES (
  'krb_001',
  'HTTP/gateway.example.com@EXAMPLE.COM',
  '/etc/mcp-gateway/gateway.keytab',
  'EXAMPLE.COM',
  1
);
```

**Configuration Fields:**

| Field              | Type    | Description                               | Example                                |
| ------------------ | ------- | ----------------------------------------- | -------------------------------------- |
| `servicePrincipal` | string  | Service Principal Name in Kerberos format | `HTTP/gateway.example.com@EXAMPLE.COM` |
| `keytabPath`       | string  | Absolute path to keytab file              | `/etc/mcp-gateway/gateway.keytab`      |
| `realm`            | string  | Kerberos realm (uppercase)                | `EXAMPLE.COM`                          |
| `enabled`          | boolean | Enable/disable Kerberos authentication    | `true`                                 |

**Validation Rules:**

- Service principal format: `SERVICE/hostname@REALM`
- Service must be uppercase (e.g., `HTTP`, `HOST`)
- Hostname must be lowercase FQDN
- Realm must be uppercase
- Keytab file must exist and be readable

### 2. Environment Variables

**Optional Kerberos environment variables:**

```bash
# Kerberos configuration file (if not using /etc/krb5.conf)
export KRB5_CONFIG=/etc/mcp-gateway/krb5.conf

# Kerberos credentials cache (for debugging)
export KRB5CCNAME=/tmp/krb5cc_mcp

# Enable Kerberos debug logging
export KRB5_TRACE=/var/log/mcp-gateway/krb5-trace.log
```

## Client Configuration

### 1. Web Browser (SPNEGO/Negotiate)

**Chrome/Edge:**

```bash
# Linux: Add trusted authentication servers
google-chrome --auth-server-whitelist="*.example.com" \
  --auth-negotiate-delegate-whitelist="*.example.com"

# Windows: Automatically uses current user's Kerberos ticket
# (no configuration needed if gateway is in Local Intranet zone)
```

**Firefox:**

```
1. Navigate to about:config
2. Set network.negotiate-auth.trusted-uris = .example.com
3. Set network.negotiate-auth.delegation-uris = .example.com
4. Restart browser
```

### 2. curl (Testing)

**Obtain Kerberos ticket:**

```bash
# Initialize Kerberos credentials
kinit alice@EXAMPLE.COM
Password for alice@EXAMPLE.COM: ****

# Verify ticket
klist
# Ticket cache: FILE:/tmp/krb5cc_1000
# Default principal: alice@EXAMPLE.COM
```

**Authenticate with gateway:**

```bash
# curl with --negotiate flag
curl -v --negotiate -u : https://gateway.example.com/auth/kerberos/login

# Response:
# {
#   "accessToken": "eyJhbGc...",
#   "refreshToken": "abc123...",
#   "expiresIn": 900,
#   "user": {
#     "id": "user_xyz",
#     "username": "alice",
#     "role": "user"
#   }
# }
```

### 3. Python (requests-kerberos)

```python
import requests
from requests_kerberos import HTTPKerberosAuth, OPTIONAL

# Authenticate using Kerberos
response = requests.post(
    'https://gateway.example.com/auth/kerberos/login',
    auth=HTTPKerberosAuth(mutual_authentication=OPTIONAL)
)

data = response.json()
access_token = data['accessToken']

# Use access token for subsequent requests
headers = {'Authorization': f'Bearer {access_token}'}
response = requests.get('https://gateway.example.com/api/servers', headers=headers)
```

### 4. Node.js (node-kerberos)

```javascript
import kerberos from "kerberos";
import axios from "axios";

async function authenticate() {
  // Initialize client
  const client = await kerberos.initializeClient("HTTP@gateway.example.com", {
    mechOID: kerberos.GSS_MECH_OID_SPNEGO,
  });

  // Generate SPNEGO token
  const token = await client.step("");

  // Send authentication request
  const response = await axios.post(
    "https://gateway.example.com/auth/kerberos/login",
    {},
    {
      headers: {
        Authorization: `Negotiate ${token.toString("base64")}`,
      },
    },
  );

  const { accessToken } = response.data;
  return accessToken;
}
```

## User Provisioning

### Just-in-Time (JIT) Provisioning

When a user authenticates via Kerberos for the first time, MCP Gateway automatically creates a user account:

**Provisioning Flow:**

1. Validate Kerberos ticket
2. Extract principal (e.g., `alice@EXAMPLE.COM`)
3. Check if user exists with `kerberos_principal = 'alice@EXAMPLE.COM'`
4. If not exists, create user:
   - `username`: extracted from principal (`alice`)
   - `role`: `user` (default)
   - `status`: `active`
   - `password_hash`: empty (Kerberos-only authentication)
   - `kerberos_principal`: full principal (`alice@EXAMPLE.COM`)

**User Record Example:**

```json
{
  "id": "user_xyz",
  "username": "alice",
  "role": "user",
  "status": "active",
  "kerberos_principal": "alice@EXAMPLE.COM",
  "created_at": "2026-06-09T12:00:00Z",
  "last_login_at": "2026-06-09T12:00:00Z"
}
```

### Principal Name Formats

MCP Gateway supports multiple principal name formats:

| Format            | Example                    | Extracted Username       |
| ----------------- | -------------------------- | ------------------------ |
| Simple            | `alice@EXAMPLE.COM`        | `alice`                  |
| With instance     | `alice/admin@EXAMPLE.COM`  | `alice/admin`            |
| Service principal | `HTTP/gateway@EXAMPLE.COM` | (not used for user auth) |

## Troubleshooting

### 1. "Invalid Kerberos token"

**Possible Causes:**

- Keytab file not found or not readable
- Service principal mismatch
- Clock skew between client and KDC (>5 minutes)
- Keytab file does not contain correct keys

**Solutions:**

```bash
# Verify keytab contains correct principal
klist -k /etc/mcp-gateway/gateway.keytab
# Expected output:
# Keytab name: FILE:/etc/mcp-gateway/gateway.keytab
# KVNO Principal
# ---- --------------------------------------------------------------------------
#    2 HTTP/gateway.example.com@EXAMPLE.COM

# Check file permissions
ls -l /etc/mcp-gateway/gateway.keytab

# Verify clock sync (NTP)
ntpdate -q pool.ntp.org

# Test keytab with kinit
kinit -k -t /etc/mcp-gateway/gateway.keytab HTTP/gateway.example.com@EXAMPLE.COM
klist
```

### 2. "Missing Authorization: Negotiate header"

**Possible Causes:**

- Client not sending Kerberos token
- Browser not configured for SPNEGO
- Client not in Kerberos realm

**Solutions:**

```bash
# Verify client has Kerberos ticket
klist

# Test with curl explicitly
curl -v --negotiate -u : https://gateway.example.com/auth/kerberos/login

# Check browser SPNEGO configuration (see Client Configuration section)
```

### 3. "Certificate validation failed" (HTTPS required)

**Kerberos/SPNEGO requires HTTPS.** Configure TLS certificates:

```bash
# Self-signed certificate (testing only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=gateway.example.com"

# Production: use Let's Encrypt or corporate CA
```

### 4. Replay Attack Prevention

**Built-in replay attack prevention:**

- Kerberos tickets are timestamped and expire
- Tickets are validated only once
- Clock skew tolerance: 5 minutes (Kerberos default)

**No additional configuration needed.**

## Security Best Practices

### 1. Keytab File Protection

```bash
# Store keytab outside web root
/etc/mcp-gateway/gateway.keytab

# Restrict permissions (owner read-only)
chmod 0400 /etc/mcp-gateway/gateway.keytab

# Use dedicated service account
chown mcp-gateway:mcp-gateway /etc/mcp-gateway/gateway.keytab

# Rotate keytab periodically (every 90 days recommended)
```

### 2. Audit Logging

Gateway logs all Kerberos authentication attempts:

```json
{
  "level": "info",
  "message": "Kerberos user authenticated",
  "userId": "user_xyz",
  "username": "alice",
  "principal": "alice@EXAMPLE.COM",
  "timestamp": "2026-06-09T12:00:00Z"
}
```

### 3. Multi-Factor Authentication

**Kerberos + LDAP/AD:**

- Require MFA at KDC level (e.g., Azure AD Conditional Access)
- Gateway validates Kerberos ticket after MFA is satisfied
- No additional gateway configuration needed

### 4. Network Segmentation

**Restrict Kerberos authentication to internal network:**

- Use firewall rules to allow Kerberos authentication only from corporate network
- Use VPN for remote access
- Consider combining with mTLS for external access

## API Reference

### POST /auth/kerberos/login

**Request:**

```http
POST /auth/kerberos/login HTTP/1.1
Host: gateway.example.com
Authorization: Negotiate YIIFtAYGKwYBBQUCoIIFqDCCBaSgMDAuBgkqhkiG9xIBAgIGC...
```

**Response (Success):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "abc123xyz...",
  "expiresIn": 900,
  "user": {
    "id": "user_xyz",
    "username": "alice",
    "role": "user",
    "tenant": null
  }
}
```

**Response (Error):**

```json
{
  "error": "Invalid Kerberos token"
}
```

## Advanced Configuration

### 1. Multiple Realms

MCP Gateway supports users from multiple Kerberos realms:

```sql
-- Realm 1: Corporate AD
INSERT INTO kerberos_config (servicePrincipal, keytabPath, realm, enabled)
VALUES ('HTTP/gateway.example.com@CORP.COM', '/etc/mcp/corp.keytab', 'CORP.COM', 1);

-- Users from both realms can authenticate
-- alice@CORP.COM and bob@PARTNER.COM
```

**Note:** Only one Kerberos configuration can be enabled at a time. Use cross-realm trust for multi-realm support.

### 2. Cross-Realm Trust

Configure cross-realm trust in `/etc/krb5.conf`:

```ini
[realms]
    EXAMPLE.COM = {
        kdc = kdc.example.com
        admin_server = kdc.example.com
    }
    PARTNER.COM = {
        kdc = kdc.partner.com
        admin_server = kdc.partner.com
    }

[capaths]
    EXAMPLE.COM = {
        PARTNER.COM = .
    }
    PARTNER.COM = {
        EXAMPLE.COM = .
    }
```

### 3. Monitoring

**Kerberos authentication metrics:**

- Total authentication attempts
- Successful authentications
- Failed authentications (by reason: invalid token, missing keytab, etc.)
- JIT provisioning events

**Query example:**

```sql
-- Recent Kerberos authentications
SELECT username, kerberos_principal, last_login_at
FROM users
WHERE kerberos_principal IS NOT NULL
ORDER BY last_login_at DESC
LIMIT 10;
```

## References

- [RFC 4559 - SPNEGO-based Kerberos and NTLM HTTP Authentication](https://tools.ietf.org/html/rfc4559)
- [MIT Kerberos Documentation](https://web.mit.edu/kerberos/krb5-latest/doc/)
- [Microsoft Active Directory Kerberos](https://docs.microsoft.com/en-us/windows-server/security/kerberos/kerberos-authentication-overview)
- [node-kerberos GitHub](https://github.com/mongodb-js/kerberos)

## Support

For Kerberos authentication issues:

1. Check keytab file permissions and principal
2. Verify clock sync between client, gateway, and KDC
3. Review gateway logs for detailed error messages
4. Test authentication with `curl --negotiate`
5. Contact your Active Directory administrator for KDC issues
