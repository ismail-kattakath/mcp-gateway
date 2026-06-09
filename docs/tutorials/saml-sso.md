# Tutorial: SAML SSO with Okta/Auth0

Learn how to set up SAML 2.0 single sign-on for MCP Gateway.

## Overview

**What you'll learn:**

- Configure SAML identity provider (Okta/Auth0)
- Set up MCP Gateway as SAML service provider
- Test SSO authentication flow
- Map SAML attributes to user permissions

**Prerequisites:**

- MCP Gateway v3.0+
- Okta or Auth0 account (free tier works)
- Domain with HTTPS (required for SAML)

**Time:** 30 minutes

## Architecture

```
User → IDP (Okta/Auth0) → SAML Assertion → MCP Gateway → Access Granted
```

## Step 1: Configure Identity Provider

### Option A: Okta

1. **Create SAML Application**
   - Admin Console → Applications → Create App Integration
   - Select "SAML 2.0"

2. **General Settings**
   - App name: `MCP Gateway`
   - App logo: (optional)

3. **SAML Settings**
   - Single sign-on URL: `https://gateway.example.com/auth/saml/callback`
   - Audience URI (SP Entity ID): `mcp-gateway`
   - Name ID format: `EmailAddress`
   - Application username: `Email`

4. **Attribute Statements**

   ```
   email     → user.email
   firstName → user.firstName
   lastName  → user.lastName
   groups    → appuser.groups
   ```

5. **Download Metadata**
   - Sign On tab → SAML Signing Certificates
   - Download "IDP metadata" XML file

### Option B: Auth0

1. **Create Application**
   - Applications → Create Application
   - Select "Regular Web Application"

2. **Enable SAML Addon**
   - Addons → SAML2 Web App
   - Application Callback URL: `https://gateway.example.com/auth/saml/callback`

3. **Settings**

   ```json
   {
     "nameIdentifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
     "nameIdentifierProbes": [
       "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
     ]
   }
   ```

4. **Download Metadata**
   - Usage tab → Copy "Identity Provider Metadata" URL

## Step 2: Configure MCP Gateway

### 2.1 Store IDP Certificate

```bash
# Download IDP metadata
curl https://your-okta-domain.com/app/abc123/sso/saml/metadata > idp-metadata.xml

# Extract certificate
mcp secrets set IDP_CERT "$(cat idp-metadata.xml)"
```

### 2.2 Create SAML Configuration

Edit `~/.mcp-gateway/auth-config.json`:

```json
{
  "authentication": {
    "strategies": ["saml", "api-key"],
    "saml": {
      "enabled": true,
      "entryPoint": "https://your-okta-domain.com/app/abc123/sso/saml",
      "issuer": "mcp-gateway",
      "callbackUrl": "https://gateway.example.com/auth/saml/callback",
      "cert": "${SECRET:IDP_CERT}",
      "identifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      "wantAssertionsSigned": true,
      "signatureAlgorithm": "sha256",
      "attributeMapping": {
        "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        "groups": "http://schemas.xmlsoap.org/claims/Group"
      },
      "groupRoleMapping": {
        "admins": "admin",
        "developers": "developer",
        "viewers": "readonly"
      },
      "autoCreateUser": true,
      "defaultRole": "user"
    }
  }
}
```

### 2.3 Restart Gateway

```bash
docker restart mcp-gateway
```

## Step 3: Test SSO Flow

### 3.1 Initiate SSO

Navigate to: `https://gateway.example.com/auth/saml`

Or use IDP-initiated SSO from Okta/Auth0 dashboard.

### 3.2 Authenticate

- Enter credentials on IDP login page
- Complete MFA if required
- Consent to attribute sharing (first time)

### 3.3 Verify Token

After successful authentication:

```bash
export TOKEN="your-jwt-token"
curl -H "Authorization: Bearer $TOKEN" \
  https://gateway.example.com/api/servers
```

## Troubleshooting

**Issue: "Invalid SAML response"**

Solution: Check certificate and signature algorithm match:

```bash
mcp config get authentication.saml.cert
```

**Issue: "Attribute mapping failed"**

Solution: Verify attribute names in SAML assertion:

```bash
mcp logs --filter saml --level debug
```

**Issue: "User not authorized"**

Solution: Check group mapping:

```bash
mcp users get <email> --format json
```

## Security Best Practices

1. **Use HTTPS Only** - SAML requires HTTPS
2. **Validate Signatures** - Set `wantAssertionsSigned: true`
3. **Encrypt Assertions** - Enable in IDP settings
4. **Rotate Certificates** - Every 1-2 years
5. **Enable Audit Logging** - Track all SSO attempts

## Production Considerations

- Certificate expiration monitoring
- Multi-IDP support (Okta + Auth0)
- Session timeout configuration
- SLO (Single Logout) implementation

## Next Steps

- [LDAP/AD Integration](ldap-integration.md)
- [Multi-Tenancy Setup](multi-tenancy.md)
- [Audit Logging](../AUDIT_LOGGING.md)
