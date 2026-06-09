# Tutorial: Setting up OAuth 2.0 with GitHub

Learn how to authenticate MCP Gateway users with GitHub OAuth 2.0.

## Overview

This tutorial covers:

- Creating a GitHub OAuth app
- Configuring MCP Gateway for GitHub OAuth
- Testing the authentication flow
- Managing user permissions

**Prerequisites:**

- MCP Gateway v3.0+
- GitHub account
- Domain name (for production) or localhost (for development)

**Estimated time:** 20 minutes

## Architecture

```
┌─────────────┐                ┌─────────────┐
│   Browser   │  (1) Login     │   GitHub    │
│             │───────────────>│    OAuth    │
│             │  (2) Authorize │             │
│             │<───────────────┤             │
└──────┬──────┘                └──────┬──────┘
       │                              │
       │ (3) Callback with code       │
       │                              │
┌──────┴──────┐                       │
│  MCP        │ (4) Exchange code     │
│  Gateway    │──────────────────────>│
│             │ (5) Access token      │
│             │<──────────────────────┘
└─────────────┘
```

## Step 1: Create GitHub OAuth App

### 1.1 Navigate to GitHub Developer Settings

Go to: https://github.com/settings/developers

Click **"New OAuth App"**

### 1.2 Configure Application

**Application name:** `MCP Gateway - Development`

**Homepage URL:** `http://localhost:3000` (development) or `https://gateway.example.com` (production)

**Application description:** `MCP Gateway authentication`

**Authorization callback URL:** `http://localhost:3000/auth/github/callback`

**Important:** The callback URL must match exactly.

### 1.3 Get Credentials

After creating the app, note:

- **Client ID**: `Iv1.abc123def456`
- **Client Secret**: Click "Generate a new client secret"

**Keep client secret secure!** Store in secrets manager.

## Step 2: Configure MCP Gateway

### 2.1 Store Secrets

```bash
# Store GitHub credentials securely
mcp secrets set GITHUB_CLIENT_ID "Iv1.abc123def456"
mcp secrets set GITHUB_CLIENT_SECRET "your-client-secret-here"
```

Or use environment variables:

```bash
export GITHUB_CLIENT_ID="Iv1.abc123def456"
export GITHUB_CLIENT_SECRET="your-client-secret-here"
```

### 2.2 Update Registry Configuration

Create or edit `~/.mcp-gateway/auth-config.json`:

```json
{
  "authentication": {
    "strategies": ["github", "api-key"],
    "github": {
      "enabled": true,
      "clientId": "${SECRET:GITHUB_CLIENT_ID}",
      "clientSecret": "${SECRET:GITHUB_CLIENT_SECRET}",
      "callbackUrl": "http://localhost:3000/auth/github/callback",
      "scope": ["read:user", "user:email"],
      "allowedOrganizations": [],
      "allowedTeams": [],
      "autoCreateUser": true,
      "defaultRole": "user"
    }
  }
}
```

**Configuration options:**

- `allowedOrganizations`: Restrict to GitHub org members (e.g., `["my-org"]`)
- `allowedTeams`: Restrict to specific teams (e.g., `["my-org/developers"]`)
- `autoCreateUser`: Create user account on first login
- `defaultRole`: Default role for new users

### 2.3 Install Dependencies (if building from source)

```bash
cd server
npm install passport-github2
```

### 2.4 Restart Gateway

```bash
npm restart
```

Or with Docker:

```bash
docker restart mcp-gateway
```

## Step 3: Test Authentication Flow

### 3.1 Access Login Page

Open browser: `http://localhost:3000/auth/github`

### 3.2 Authorize on GitHub

You'll be redirected to GitHub:

- Review permissions requested
- Click "Authorize"

### 3.3 Verify Redirect

After authorization, you'll be redirected to:
`http://localhost:3000/auth/github/callback?code=abc123...`

Gateway exchanges code for access token and creates/logs in user.

### 3.4 Get Access Token

On successful authentication, you'll receive:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "expiresIn": 900,
  "user": {
    "id": "user-123",
    "email": "alice@example.com",
    "username": "alice",
    "provider": "github",
    "roles": ["user"]
  }
}
```

**Save access token** for API requests.

### 3.5 Test API Access

```bash
export TOKEN="your-access-token-here"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/servers
```

Expected: List of servers (if authorized)

## Step 4: Manage Users and Permissions

### 4.1 List Users

```bash
mcp users list
```

Output:

```
ID          Username    Email                  Provider    Roles
user-123    alice       alice@example.com      github      user
user-456    bob         bob@example.com        github      user, admin
```

### 4.2 Grant Permissions

```bash
# Grant admin role
mcp users add-role alice admin

# Grant specific server access
mcp permissions grant alice --server filesystem --tools read_file,write_file
```

### 4.3 Revoke Access

```bash
# Remove role
mcp users remove-role alice admin

# Disable user
mcp users update alice --enabled false
```

## Step 5: Advanced Configuration

### 5.1 Restrict to Organization Members

Edit `auth-config.json`:

```json
{
  "github": {
    "allowedOrganizations": ["my-company"]
  }
}
```

Only users from `my-company` GitHub organization can log in.

### 5.2 Restrict to Team Members

```json
{
  "github": {
    "allowedTeams": ["my-company/engineering", "my-company/devops"]
  }
}
```

Only members of specified teams can log in.

### 5.3 Map Teams to Roles

```json
{
  "github": {
    "teamRoleMapping": {
      "my-company/admins": "admin",
      "my-company/engineering": "developer",
      "my-company/support": "readonly"
    }
  }
}
```

Automatically assign roles based on GitHub team membership.

### 5.4 Custom User Mapping

```json
{
  "github": {
    "userMapping": {
      "username": "$.login",
      "email": "$.email",
      "name": "$.name",
      "avatar": "$.avatar_url",
      "company": "$.company"
    }
  }
}
```

Map GitHub profile fields to MCP Gateway user fields.

## Troubleshooting

### Issue: "Redirect URI mismatch"

**Cause:** Callback URL doesn't match GitHub app configuration.

**Solution:** Verify URLs match exactly:

- GitHub app: `http://localhost:3000/auth/github/callback`
- Gateway config: `http://localhost:3000/auth/github/callback`

### Issue: "Organization not authorized"

**Cause:** User is not a member of allowed organization.

**Solution:**

- Add user to organization
- Or remove `allowedOrganizations` restriction

### Issue: "Access denied"

**Cause:** User doesn't have required permissions.

**Solution:**

```bash
mcp users add-role <username> user
mcp permissions grant <username> --resource server --action read
```

### Issue: "Token expired"

**Cause:** JWT access token expired (default: 15 minutes).

**Solution:** Use refresh token to get new access token:

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "your-refresh-token"}'
```

## Security Best Practices

### 1. Use HTTPS in Production

**Never use HTTP for OAuth in production.**

Update callback URL to HTTPS:

```json
{
  "callbackUrl": "https://gateway.example.com/auth/github/callback"
}
```

Update GitHub app settings to match.

### 2. Restrict Organizations/Teams

**Don't allow all GitHub users.**

Set `allowedOrganizations` or `allowedTeams`:

```json
{
  "allowedOrganizations": ["my-company"]
}
```

### 3. Limit OAuth Scopes

**Request minimum required scopes:**

```json
{
  "scope": ["read:user", "user:email"]
}
```

Don't request `repo` or other sensitive scopes unless needed.

### 4. Rotate Client Secrets

**Rotate secrets regularly (e.g., every 90 days):**

1. Generate new secret in GitHub
2. Update secrets manager:
   ```bash
   mcp secrets set GITHUB_CLIENT_SECRET "new-secret"
   ```
3. Restart gateway
4. Revoke old secret in GitHub

### 5. Monitor Failed Logins

**Enable audit logging:**

```bash
mcp audit list --action auth:login:failed --since "7 days ago"
```

Set up alerts for suspicious activity.

### 6. Implement Session Timeout

**Configure token expiration:**

```json
{
  "jwt": {
    "accessTokenExpiry": "15m",
    "refreshTokenExpiry": "7d"
  }
}
```

### 7. Use State Parameter

**Prevent CSRF attacks:**

MCP Gateway automatically generates and validates `state` parameter. No configuration needed.

## Production Deployment

### Reverse Proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name gateway.example.com;

  ssl_certificate /etc/ssl/cert.pem;
  ssl_certificate_key /etc/ssl/key.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: github-oauth
type: Opaque
stringData:
  clientId: "Iv1.abc123def456"
  clientSecret: "your-client-secret"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: auth-config
data:
  auth-config.json: |
    {
      "authentication": {
        "strategies": ["github"],
        "github": {
          "enabled": true,
          "clientId": "${SECRET:GITHUB_CLIENT_ID}",
          "clientSecret": "${SECRET:GITHUB_CLIENT_SECRET}",
          "callbackUrl": "https://gateway.example.com/auth/github/callback"
        }
      }
    }
```

## Next Steps

- [SAML SSO with Okta](saml-sso.md)
- [LDAP/AD Integration](ldap-integration.md)
- [Multi-Tenancy Setup](multi-tenancy.md)
- [Role-Based Access Control](../USER_GUIDE.md#role-based-access-control)

## Resources

- [GitHub OAuth Apps Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Passport GitHub Strategy](https://github.com/cfsghost/passport-github)
- [MCP Gateway Security Guide](../SECURITY_HARDENING.md)
