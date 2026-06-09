# mTLS (Mutual TLS) Client Certificate Authentication

This guide explains how to configure and use mutual TLS (mTLS) client certificate authentication in MCP Gateway for high-security environments.

## Overview

Mutual TLS (mTLS) provides strong authentication by requiring clients to present valid X.509 certificates during the TLS handshake. This is common in zero-trust architectures, service mesh environments, and high-security deployments.

**Key Features:**

- Cryptographic authentication (no passwords)
- Certificate chain validation against CA
- Certificate revocation checking (CRL and OCSP)
- Flexible identity extraction (CN, SAN, custom OID)
- Just-in-time (JIT) user provisioning
- Support for hardware security modules (HSM)

**Related Epic:** Epic #21 (Advanced Authentication - Kerberos/mTLS)

## Architecture

### Authentication Flow

```
1. Client initiates TLS handshake
2. Server requests client certificate (requestCert: true)
3. Client presents X.509 certificate
4. Server validates certificate:
   - Verify certificate chain against CA
   - Check certificate dates (notBefore/notAfter)
   - Check revocation status (CRL/OCSP)
5. Server extracts identity from certificate
6. Server provisions/updates user (JIT)
7. Server returns JWT access + refresh tokens
```

### Components

- **CA Certificate**: Root or intermediate CA that signed client certificates
- **Client Certificate**: X.509 certificate presented by client
- **CRL (Certificate Revocation List)**: List of revoked certificates (optional)
- **OCSP (Online Certificate Status Protocol)**: Real-time revocation checking (optional)
- **Identity Field**: Certificate field used for user identity (CN, SAN, or OID)

## Prerequisites

### 1. Certificate Authority (CA)

You need a CA to issue client certificates. Options:

**Option A: Self-Signed CA (Testing)**

```bash
# Generate CA private key
openssl genrsa -out ca-key.pem 4096

# Generate CA certificate (valid 10 years)
openssl req -new -x509 -days 3650 -key ca-key.pem -out ca-cert.pem \
  -subj "/CN=MCP Gateway CA/O=Example Inc/C=US"

# Protect CA private key
chmod 0400 ca-key.pem
```

**Option B: Corporate PKI**

- Use existing corporate CA (e.g., Microsoft CA, AWS Private CA)
- Export CA certificate in PEM format
- Ensure gateway can access CA certificate

**Option C: Public CA**

- Let's Encrypt (for automated certificate management)
- DigiCert, GlobalSign, etc. (for enterprise)

### 2. Client Certificates

**Generate client certificate:**

```bash
# Generate client private key
openssl genrsa -out alice-key.pem 2048

# Generate certificate signing request (CSR)
openssl req -new -key alice-key.pem -out alice-csr.pem \
  -subj "/CN=alice/OU=Engineering/O=Example Inc/emailAddress=alice@example.com"

# Sign CSR with CA (valid 1 year)
openssl x509 -req -in alice-csr.pem -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out alice-cert.pem -days 365

# Verify certificate
openssl x509 -in alice-cert.pem -text -noout
```

**Certificate with Subject Alternative Names (SAN):**

```bash
# Create SAN configuration
cat > alice-san.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req

[req_distinguished_name]
CN = alice

[v3_req]
subjectAltName = @alt_names

[alt_names]
email = alice@example.com
DNS.1 = alice.example.com
EOF

# Generate CSR with SAN
openssl req -new -key alice-key.pem -out alice-csr.pem -config alice-san.cnf

# Sign with CA
openssl x509 -req -in alice-csr.pem -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out alice-cert.pem -days 365 -extensions v3_req \
  -extfile alice-san.cnf
```

### 3. Server Certificate

Gateway also needs a server certificate for HTTPS:

```bash
# Generate server private key
openssl genrsa -out server-key.pem 2048

# Generate server CSR
openssl req -new -key server-key.pem -out server-csr.pem \
  -subj "/CN=gateway.example.com/O=Example Inc"

# Sign with CA
openssl x509 -req -in server-csr.pem -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -days 365
```

## Configuration

### 1. Database Configuration

Create mTLS configuration record:

```sql
INSERT INTO mtls_config (
  id,
  requireClientCert,
  caCertPath,
  crlPath,
  ocspUrl,
  identityField,
  customOid,
  enabled
) VALUES (
  'mtls_001',
  1,
  '/etc/mcp-gateway/ca-cert.pem',
  '/etc/mcp-gateway/ca-crl.pem',
  'http://ocsp.example.com',
  'CN',
  NULL,
  1
);
```

**Configuration Fields:**

| Field               | Type    | Description                                                     | Example                        |
| ------------------- | ------- | --------------------------------------------------------------- | ------------------------------ |
| `requireClientCert` | boolean | Require client certificate (reject if missing)                  | `true`                         |
| `caCertPath`        | string  | Absolute path to CA certificate (PEM)                           | `/etc/mcp-gateway/ca-cert.pem` |
| `crlPath`           | string  | Path to CRL file (optional)                                     | `/etc/mcp-gateway/ca-crl.pem`  |
| `ocspUrl`           | string  | OCSP responder URL (optional)                                   | `http://ocsp.example.com`      |
| `identityField`     | enum    | Certificate field for user identity                             | `CN`, `SAN`, or `OID`          |
| `customOid`         | string  | Custom OID for identity extraction (if `identityField = 'OID'`) | `1.2.840.113549.1.9.1`         |
| `enabled`           | boolean | Enable/disable mTLS authentication                              | `true`                         |

**Identity Field Options:**

| Field                            | Description                      | Example             |
| -------------------------------- | -------------------------------- | ------------------- |
| `CN` (Common Name)               | Use CN from subject              | `alice`             |
| `SAN` (Subject Alternative Name) | Use first SAN (email or DNS)     | `alice@example.com` |
| `OID` (Custom OID)               | Use custom certificate extension | Custom employee ID  |

### 2. Node.js HTTPS Server Configuration

**Update `server/src/index.ts`:**

```typescript
import https from "https";
import fs from "fs";

// Load certificates
const serverKey = fs.readFileSync("/etc/mcp-gateway/server-key.pem");
const serverCert = fs.readFileSync("/etc/mcp-gateway/server-cert.pem");
const caCert = fs.readFileSync("/etc/mcp-gateway/ca-cert.pem");

// Create HTTPS server with mTLS
const httpsOptions = {
  key: serverKey,
  cert: serverCert,
  ca: caCert,
  requestCert: true, // Request client certificate
  rejectUnauthorized: false, // Don't reject at TLS level (validate in app)
};

const server = https.createServer(httpsOptions, app);
server.listen(3000, () => {
  console.log("Gateway listening on https://0.0.0.0:3000");
});
```

**Why `rejectUnauthorized: false`?**

- Allows fallback to other authentication methods
- Gateway validates certificate in application layer
- Provides better error messages to clients

### 3. Certificate Revocation Lists (CRL)

**Generate CRL:**

```bash
# Create CRL configuration
cat > crl.cnf <<EOF
[ca]
default_ca = CA_default

[CA_default]
crl = /etc/mcp-gateway/ca-crl.pem
crl_dir = /etc/mcp-gateway/crl
database = /etc/mcp-gateway/ca-index.txt
default_crl_days = 30
EOF

# Create empty database
touch /etc/mcp-gateway/ca-index.txt
echo 1000 > /etc/mcp-gateway/ca-serial

# Generate initial CRL
openssl ca -config crl.cnf -gencrl -keyfile ca-key.pem \
  -cert ca-cert.pem -out ca-crl.pem

# Revoke a certificate
openssl ca -config crl.cnf -revoke alice-cert.pem \
  -keyfile ca-key.pem -cert ca-cert.pem

# Regenerate CRL
openssl ca -config crl.cnf -gencrl -keyfile ca-key.pem \
  -cert ca-cert.pem -out ca-crl.pem
```

**CRL Update Schedule:**

- Update CRL regularly (daily or weekly)
- Distribute updated CRL to gateway
- Gateway checks CRL on each authentication

### 4. OCSP Responder (Optional)

**Setup OCSP responder:**

```bash
# Run OpenSSL OCSP responder (testing only)
openssl ocsp -port 8080 -text \
  -index /etc/mcp-gateway/ca-index.txt \
  -CA ca-cert.pem -rkey ca-key.pem -rsigner ca-cert.pem

# Production: use dedicated OCSP responder
# - Microsoft Active Directory Certificate Services
# - EJBCA
# - Boulder (Let's Encrypt)
```

## Client Configuration

### 1. curl (Testing)

```bash
# Authenticate with client certificate
curl -v --cert alice-cert.pem --key alice-key.pem \
  --cacert ca-cert.pem \
  https://gateway.example.com/auth/me

# Response (automatic mTLS authentication):
# {
#   "id": "user_xyz",
#   "username": "alice",
#   "role": "user"
# }
```

**Note:** mTLS authentication happens during TLS handshake. No explicit `/auth/mtls/login` endpoint needed.

### 2. Python (requests)

```python
import requests

# Authenticate with client certificate
response = requests.get(
    'https://gateway.example.com/auth/me',
    cert=('alice-cert.pem', 'alice-key.pem'),
    verify='ca-cert.pem'
)

user = response.json()
print(f"Authenticated as: {user['username']}")
```

### 3. Node.js (https)

```javascript
import https from "https";
import fs from "fs";

const options = {
  hostname: "gateway.example.com",
  port: 443,
  path: "/auth/me",
  method: "GET",
  key: fs.readFileSync("alice-key.pem"),
  cert: fs.readFileSync("alice-cert.pem"),
  ca: fs.readFileSync("ca-cert.pem"),
};

https
  .request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const user = JSON.parse(data);
      console.log(`Authenticated as: ${user.username}`);
    });
  })
  .end();
```

### 4. Browser (Chrome/Firefox)

**Import client certificate:**

**Chrome:**

1. Settings → Privacy and security → Security
2. Manage certificates → Your certificates
3. Import → Select `alice-cert.pem` + `alice-key.pem`
4. Enter passphrase (if encrypted)

**Firefox:**

1. Preferences → Privacy & Security
2. View Certificates → Your Certificates
3. Import → Select PKCS#12 file (`.p12` format)

**Convert PEM to PKCS#12:**

```bash
openssl pkcs12 -export -out alice-cert.p12 \
  -inkey alice-key.pem -in alice-cert.pem \
  -certfile ca-cert.pem -name "Alice"
```

**Access gateway:**

- Navigate to `https://gateway.example.com`
- Browser prompts for certificate selection
- Select Alice's certificate
- Browser automatically sends certificate during TLS handshake

## User Provisioning

### Just-in-Time (JIT) Provisioning

When a user authenticates via mTLS for the first time, MCP Gateway automatically creates a user account:

**Provisioning Flow:**

1. Validate client certificate (chain, dates, revocation)
2. Extract identity from certificate (CN, SAN, or OID)
3. Check if user exists with `certificate_dn = '<subject DN>'`
4. If not exists, create user:
   - `username`: extracted from identity field
   - `role`: `user` (default)
   - `status`: `active`
   - `password_hash`: empty (certificate-only authentication)
   - `certificate_dn`: full subject DN

**User Record Example:**

```json
{
  "id": "user_xyz",
  "username": "alice",
  "role": "user",
  "status": "active",
  "certificate_dn": "CN=alice, OU=Engineering, O=Example Inc",
  "created_at": "2026-06-09T12:00:00Z",
  "last_login_at": "2026-06-09T12:00:00Z"
}
```

### Identity Extraction

**CN (Common Name):**

```
Certificate DN: CN=alice, OU=Engineering, O=Example Inc
→ Identity: alice
→ Username: alice
```

**SAN (Subject Alternative Name):**

```
Certificate SAN: alice@example.com, alice.example.com
→ Identity: alice@example.com (first SAN)
→ Username: alice (local part before @)
```

**OID (Custom Object Identifier):**

```
Certificate Extension (OID 1.2.3.4): employee-12345
→ Identity: employee-12345
→ Username: employee_12345 (sanitized)
```

## Certificate Management

### 1. Certificate Lifecycle

**Typical certificate validity:**

- Development: 1 year
- Production: 1-2 years
- High-security: 90 days (quarterly rotation)

**Renewal Process:**

```bash
# Generate new CSR (reuse existing key or generate new)
openssl req -new -key alice-key.pem -out alice-renewal-csr.pem \
  -subj "/CN=alice/OU=Engineering/O=Example Inc"

# Sign with CA
openssl x509 -req -in alice-renewal-csr.pem -CA ca-cert.pem \
  -CAkey ca-key.pem -CAcreateserial -out alice-cert-new.pem -days 365

# Replace old certificate
mv alice-cert.pem alice-cert-old.pem
mv alice-cert-new.pem alice-cert.pem

# Verify new certificate
openssl x509 -in alice-cert.pem -noout -dates
```

### 2. Certificate Revocation

**Revoke compromised certificate:**

```bash
# Add certificate to CRL
openssl ca -config crl.cnf -revoke alice-cert.pem \
  -keyfile ca-key.pem -cert ca-cert.pem

# Regenerate CRL
openssl ca -config crl.cnf -gencrl -keyfile ca-key.pem \
  -cert ca-cert.pem -out ca-crl.pem

# Distribute updated CRL to gateway
scp ca-crl.pem gateway:/etc/mcp-gateway/ca-crl.pem

# Gateway checks CRL on next authentication attempt
```

**OCSP revocation:**

- Real-time revocation checking
- No CRL distribution needed
- Requires OCSP responder availability

### 3. Key Protection

**Hardware Security Module (HSM):**

```javascript
// PKCS#11 support via node-pkcs11js
import pkcs11 from "pkcs11js";

const pkcs11Module = new pkcs11.PKCS11();
pkcs11Module.load("/usr/lib/libsofthsm2.so");

// Use HSM for private key operations
// Certificate stored in HSM, never exported
```

**Client-side protection:**

- Store private keys in OS keychain (macOS Keychain, Windows Credential Manager)
- Use hardware tokens (YubiKey, smart cards)
- Enable key passphrase protection

## Troubleshooting

### 1. "Client certificate required"

**Possible Causes:**

- Client not presenting certificate
- Certificate not imported in browser
- Server not requesting certificate

**Solutions:**

```bash
# Verify server is requesting certificate
openssl s_client -connect gateway.example.com:443 -showcerts
# Look for "Acceptable client certificate CA names"

# Test with curl
curl -v --cert alice-cert.pem --key alice-key.pem \
  https://gateway.example.com/auth/me
```

### 2. "Invalid certificate chain"

**Possible Causes:**

- Certificate not signed by trusted CA
- CA certificate not configured correctly
- Intermediate CA missing

**Solutions:**

```bash
# Verify certificate chain
openssl verify -CAfile ca-cert.pem alice-cert.pem
# Expected: alice-cert.pem: OK

# Check certificate issuer
openssl x509 -in alice-cert.pem -noout -issuer

# Include intermediate CA in chain
cat intermediate-ca.pem root-ca.pem > ca-bundle.pem
openssl verify -CAfile ca-bundle.pem alice-cert.pem
```

### 3. "Certificate has expired"

**Possible Causes:**

- Certificate notAfter date in the past
- Certificate notBefore date in the future

**Solutions:**

```bash
# Check certificate dates
openssl x509 -in alice-cert.pem -noout -dates
# notBefore=Jan  1 00:00:00 2025 GMT
# notAfter=Dec 31 23:59:59 2026 GMT

# Renew certificate (see Certificate Lifecycle section)
```

### 4. "Certificate has been revoked"

**Possible Causes:**

- Certificate revoked in CRL
- OCSP responder reports revoked status

**Solutions:**

```bash
# Check CRL
openssl crl -in ca-crl.pem -text -noout | grep -A2 "Serial Number"

# Check OCSP status
openssl ocsp -issuer ca-cert.pem -cert alice-cert.pem \
  -url http://ocsp.example.com -CAfile ca-cert.pem

# Issue new certificate if legitimately revoked
```

## Security Best Practices

### 1. Certificate Validation

**Gateway validates:**

- ✅ Certificate chain against CA
- ✅ Certificate dates (notBefore/notAfter)
- ✅ Certificate revocation (CRL/OCSP)
- ✅ Certificate signature

**Gateway does NOT validate:**

- ❌ Key usage extensions (done at TLS layer)
- ❌ Extended key usage (done at TLS layer)

### 2. Private Key Protection

**Server-side:**

```bash
# Restrict CA private key (most critical)
chmod 0400 ca-key.pem
chown root:root ca-key.pem

# Server private key
chmod 0400 server-key.pem
chown mcp-gateway:mcp-gateway server-key.pem

# Store private keys in HSM for production
```

**Client-side:**

- Never share private keys
- Encrypt private keys with passphrase
- Store in hardware token (YubiKey, smart card)
- Rotate keys regularly

### 3. Certificate Pinning

**Pin specific CA certificates:**

```typescript
// Only accept certificates from specific CA
const allowedCAFingerprints = ["SHA256:abc123...", "SHA256:def456..."];

// Validate CA fingerprint during authentication
```

### 4. Audit Logging

Gateway logs all mTLS authentication attempts:

```json
{
  "level": "info",
  "message": "mTLS user authenticated",
  "userId": "user_xyz",
  "username": "alice",
  "certificateDN": "CN=alice, OU=Engineering, O=Example Inc",
  "timestamp": "2026-06-09T12:00:00Z"
}
```

## Advanced Configuration

### 1. Certificate-Based Authorization

**Extract custom attributes from certificate:**

```typescript
// Parse custom OID for employee ID
const employeeIdOid = "1.2.840.113549.1.9.1";
const employeeId = cert.extensions.find(
  (ext) => ext.oid === employeeIdOid,
)?.value;

// Use for role assignment
const role = employeeId.startsWith("admin-") ? "admin" : "user";
```

### 2. Multi-CA Support

**Trust multiple CAs:**

```bash
# Concatenate CA certificates
cat corporate-ca.pem partner-ca.pem > ca-bundle.pem

# Configure gateway to use bundle
caCertPath: '/etc/mcp-gateway/ca-bundle.pem'
```

### 3. Smart Card Integration

**PKCS#11 support:**

```bash
# List available tokens
pkcs11-tool --module /usr/lib/libsofthsm2.so --list-token-slots

# Import certificate to smart card
pkcs11-tool --module /usr/lib/libsofthsm2.so \
  --write-object alice-cert.pem --type cert --label "Alice"
```

### 4. Automated Certificate Renewal

**cert-manager (Kubernetes):**

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: alice-client-cert
spec:
  secretName: alice-client-cert-tls
  duration: 2160h # 90 days
  renewBefore: 360h # 15 days
  issuerRef:
    name: corporate-ca
    kind: Issuer
  commonName: alice
  emailAddresses:
    - alice@example.com
```

## Monitoring

**mTLS authentication metrics:**

- Total certificate authentications
- Successful authentications
- Failed authentications (by reason: invalid chain, revoked, expired)
- JIT provisioning events
- Certificate expiration alerts

**Query example:**

```sql
-- Recent mTLS authentications
SELECT username, certificate_dn, last_login_at
FROM users
WHERE certificate_dn IS NOT NULL
ORDER BY last_login_at DESC
LIMIT 10;

-- Certificates expiring soon (requires custom table)
SELECT certificate_dn, not_after
FROM user_certificates
WHERE not_after < DATE('now', '+30 days')
ORDER BY not_after ASC;
```

## References

- [RFC 5280 - X.509 Certificate Profile](https://tools.ietf.org/html/rfc5280)
- [RFC 6960 - OCSP](https://tools.ietf.org/html/rfc6960)
- [RFC 5280 - CRL](https://tools.ietf.org/html/rfc5280#section-5)
- [node-forge Documentation](https://github.com/digitalbazaar/forge)
- [OpenSSL PKI Tutorial](https://pki-tutorial.readthedocs.io/)

## Support

For mTLS authentication issues:

1. Verify certificate chain with `openssl verify`
2. Check certificate dates and revocation status
3. Review gateway logs for detailed error messages
4. Test authentication with `curl --cert`
5. Contact your PKI administrator for CA issues
