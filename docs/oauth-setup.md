# OAuth Setup Guide

This guide walks you through setting up OAuth authentication for the MCP Gateway.

## Overview

The MCP Gateway supports OAuth 2.0 authentication with automatic token management:

- **Encrypted Storage**: Tokens stored with AES-256-GCM encryption in `~/.mcp/tokens.enc`
- **Auto-Refresh**: Background job refreshes tokens before expiry
- **Easy Integration**: Reference tokens in registry as `${GITHUB_ACCESS_TOKEN}`
- **Multiple Providers**: GitHub and Smithery (extensible)

## Quick Start

### 1. Register OAuth Applications

#### GitHub OAuth App

1. Go to **https://github.com/settings/developers**
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: `MCP Gateway` (or your preferred name)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/oauth/github/callback`
4. Click **"Register application"**
5. Copy the **Client ID**
6. Click **"Generate a new client secret"** and copy it

#### Smithery OAuth App

1. Go to **https://smithery.ai/settings/oauth**
2. Click **"Create OAuth App"**
3. Fill in:
   - **Application name**: `MCP Gateway`
   - **Redirect URI**: `http://localhost:3000/oauth/smithery/callback`
4. Save and copy the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

Edit `.env` file and add your OAuth credentials:

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_REDIRECT_URI=http://localhost:3000/oauth/github/callback

# Smithery OAuth
SMITHERY_CLIENT_ID=your_smithery_client_id_here
SMITHERY_CLIENT_SECRET=your_smithery_client_secret_here
SMITHERY_REDIRECT_URI=http://localhost:3000/oauth/smithery/callback

# Encryption key (auto-generated if not provided)
TOKEN_ENCRYPTION_KEY=
```

**Note**: If you don't provide `TOKEN_ENCRYPTION_KEY`, one will be auto-generated and saved to `.env` on first run.

### 3. Configure Backends in Registry

Edit `registry.json` and configure backends to use OAuth tokens:

```json
{
  "backends": {
    "github": {
      "name": "GitHub API",
      "type": "npx",
      "install": {
        "package": "@modelcontextprotocol/server-github",
        "version": "latest"
      },
      "runtime": {
        "env": {
          "GITHUB_TOKEN": "${GITHUB_ACCESS_TOKEN}"
        }
      },
      "auth": {
        "type": "oauth",
        "provider": "github",
        "scopes": ["repo", "read:org"],
        "tokenRefresh": true
      },
      "lifecycle": "persistent",
      "enabled": true
    }
  }
}
```

### 4. Start Gateway

```bash
cd server
npm start
```

### 5. Connect OAuth Account

**Via Browser:**

1. Open browser to `http://localhost:3000/oauth/github/start`
2. Approve permissions on GitHub
3. You'll be redirected back with success message

**Via UI (if you have the web UI):**

1. Open `http://localhost:3000` in browser
2. Click **"Connect GitHub"** button
3. Approve permissions
4. See connection status in dashboard

### 6. Verify Connection

Check OAuth status:

```bash
curl http://localhost:3000/oauth/github/status
```

Response:

```json
{
  "connected": true,
  "provider": "github",
  "scopes": ["repo", "read:org"],
  "expires_at": "2024-12-31T23:59:59.000Z",
  "expired": false,
  "has_refresh_token": true,
  "user": "your-github-username",
  "created_at": 1234567890,
  "updated_at": 1234567890
}
```

### 7. Start Using MCP

The backend will now automatically receive the OAuth token:

```bash
# Connect Claude Code to gateway
# Edit ~/.claude/.mcp.json
{
  "gateway": {
    "url": "http://localhost:3000/sse",
    "transport": "sse"
  }
}
```

Now when you use GitHub tools in Claude Code, they'll be authenticated!

## OAuth Flow Diagram

```
┌─────────┐         ┌──────────┐         ┌─────────┐         ┌─────────┐
│  User   │         │ Gateway  │         │  GitHub │         │ Backend │
│ Browser │         │  Server  │         │  OAuth  │         │   MCP   │
└────┬────┘         └────┬─────┘         └────┬────┘         └────┬────┘
     │                   │                     │                   │
     │ 1. Click Connect  │                     │                   │
     ├──────────────────►│                     │                   │
     │                   │                     │                   │
     │ 2. Redirect to OAuth                    │                   │
     ├──────────────────────────────────────►  │                   │
     │                   │                     │                   │
     │ 3. User approves  │                     │                   │
     ├──────────────────────────────────────►  │                   │
     │                   │                     │                   │
     │ 4. Callback with code                   │                   │
     │◄──────────────────┴─────────────────────┤                   │
     │                   │                     │                   │
     │                   │ 5. Exchange code    │                   │
     │                   ├────────────────────►│                   │
     │                   │                     │                   │
     │                   │ 6. Return tokens    │                   │
     │                   │◄────────────────────┤                   │
     │                   │                     │                   │
     │                   │ 7. Encrypt & save   │                   │
     │                   │       tokens        │                   │
     │                   │                     │                   │
     │ 8. Success        │                     │                   │
     │◄──────────────────┤                     │                   │
     │                   │                     │                   │
     │                   │ 9. Backend starts   │                   │
     │                   ├────────────────────────────────────────►│
     │                   │                     │                   │
     │                   │ 10. Inject token    │                   │
     │                   ├────────────────────────────────────────►│
     │                   │                     │                   │
```

## API Reference

### OAuth Endpoints

#### GitHub

- **Start OAuth Flow**
  ```
  GET /oauth/github/start?scopes=repo,read:org
  ```
  Redirects to GitHub authorization page.

- **OAuth Callback**
  ```
  GET /oauth/github/callback?code=...&state=...
  ```
  Handles callback from GitHub, exchanges code for tokens.

- **Refresh Token**
  ```
  POST /oauth/github/refresh
  ```
  Manually refresh the access token.

- **Disconnect**
  ```
  POST /oauth/github/disconnect
  ```
  Delete stored tokens and disconnect account.

- **Get Status**
  ```
  GET /oauth/github/status
  ```
  Get current connection status.

#### Smithery

Same endpoints, replace `/github/` with `/smithery/`:

- `GET /oauth/smithery/start`
- `GET /oauth/smithery/callback`
- `POST /oauth/smithery/refresh`
- `POST /oauth/smithery/disconnect`
- `GET /oauth/smithery/status`

#### General

- **All OAuth Status**
  ```
  GET /oauth/status
  ```
  Get status for all configured providers.

## Token Storage

### Location

Tokens are encrypted and stored at:
```
~/.mcp/tokens.enc
```

### Encryption Details

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2-SHA256 (100,000 iterations)
- **Random**: Salt and IV generated per encryption
- **Integrity**: Authentication tag verifies data integrity

### Backup

To backup your OAuth tokens:

```bash
# Stop gateway first
cp ~/.mcp/tokens.enc ~/.mcp/tokens.enc.backup

# Also backup encryption key from .env
grep TOKEN_ENCRYPTION_KEY .env > .env.key.backup
```

To restore:

```bash
cp ~/.mcp/tokens.enc.backup ~/.mcp/tokens.enc
```

## Auto Token Refresh

The gateway automatically refreshes tokens before they expire:

- **Check Interval**: Every 1 hour
- **Refresh Threshold**: When token expires in < 1 hour
- **Background Job**: Runs continuously while gateway is running
- **Events**: Emits `token:refreshed` and `token:refresh_failed` events

To manually refresh a token:

```bash
curl -X POST http://localhost:3000/oauth/github/refresh
```

## Troubleshooting

### "OAuth credentials not configured"

**Problem**: Gateway can't find OAuth credentials.

**Solution**:
1. Check `.env` file has `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
2. Restart gateway after adding credentials
3. Verify no typos in variable names

### "State mismatch in OAuth callback"

**Problem**: Security check failed (CSRF protection).

**Solution**:
1. Clear browser cookies and try again
2. Check if gateway is behind a proxy that strips cookies
3. Try in incognito/private browsing mode

### "Token not found"

**Problem**: Backend can't find OAuth token.

**Solution**:
1. Check connection status: `curl http://localhost:3000/oauth/github/status`
2. If not connected, go through OAuth flow again
3. Verify registry uses correct variable: `${GITHUB_ACCESS_TOKEN}`
4. Restart backend after connecting OAuth

### "Token expired"

**Problem**: Access token has expired.

**Solution**:
1. Gateway should auto-refresh, check logs for errors
2. Manually refresh: `curl -X POST http://localhost:3000/oauth/github/refresh`
3. If no refresh token, re-authenticate through OAuth flow

### "Encryption key error"

**Problem**: TOKEN_ENCRYPTION_KEY invalid or missing.

**Solution**:
1. Remove `TOKEN_ENCRYPTION_KEY` from `.env` to auto-generate
2. Or manually generate: `openssl rand -hex 32`
3. If changing key, all tokens must be re-authenticated

### Backend not receiving token

**Problem**: `${GITHUB_ACCESS_TOKEN}` resolves to empty string.

**Solution**:
1. Verify token exists: `curl http://localhost:3000/oauth/github/status`
2. Check registry variable name matches: `GITHUB_ACCESS_TOKEN` or `SMITHERY_ACCESS_TOKEN`
3. Restart backend after connecting OAuth (on-demand backends restart automatically)
4. Check gateway logs for "Unresolved environment variable" warnings

## Production Deployment

For production deployments:

### 1. Update Redirect URIs

Change to production domain in `.env`:

```bash
GITHUB_REDIRECT_URI=https://mcp-gateway.yourdomain.com/oauth/github/callback
SMITHERY_REDIRECT_URI=https://mcp-gateway.yourdomain.com/oauth/smithery/callback
```

Also update in OAuth app settings on GitHub/Smithery.

### 2. Use HTTPS

Deploy behind reverse proxy (nginx/caddy):

```nginx
# nginx example
server {
    listen 443 ssl http2;
    server_name mcp-gateway.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Secure Environment

```bash
# Set production mode
NODE_ENV=production

# Enable auth if needed
ENABLE_AUTH=true
GATEWAY_API_KEY=<strong-random-key>

# Generate strong encryption key
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 4. Monitor Token Refresh

Set up alerts for token refresh failures:

```javascript
import { getOAuthManager } from './oauth/index.js';

const oauthManager = getOAuthManager();

oauthManager.on('token:refresh_failed', ({ provider, error }) => {
  // Send alert to monitoring system
  console.error(`ALERT: OAuth token refresh failed for ${provider}: ${error}`);
  // sendToSlack/PagerDuty/etc.
});
```

## Security Best Practices

1. **Never commit `.env`** to version control
2. **Rotate encryption key** periodically (requires re-authentication)
3. **Use minimum scopes** required for your use case
4. **Monitor token usage** for suspicious activity
5. **Enable HTTPS** in production
6. **Backup tokens.enc** securely (it's encrypted but still sensitive)
7. **Restrict gateway access** with `ENABLE_AUTH=true` if public-facing
8. **Keep dependencies updated** for security patches

## FAQ

**Q: Can I use the same OAuth app for development and production?**

A: You can, but it's better to create separate OAuth apps for dev/staging/prod environments.

**Q: What happens if token refresh fails?**

A: The gateway emits a `token:refresh_failed` event and logs the error. The backend will continue using the expired token (which will likely fail). User needs to re-authenticate through OAuth flow.

**Q: Can I manually set tokens instead of OAuth?**

A: Yes, you can still use regular environment variables in `.env`:
```bash
GITHUB_TOKEN=ghp_your_personal_access_token
```
Then in registry: `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`

**Q: How do I add a new OAuth provider?**

A: Follow the instructions in `server/src/oauth/README.md` under "Adding New Providers".

**Q: Do tokens sync across machines?**

A: No, tokens are stored locally at `~/.mcp/tokens.enc`. Each machine needs its own OAuth authentication.

**Q: What if I lose my encryption key?**

A: All tokens will be lost. Users must re-authenticate through OAuth flows. Backup your `.env` file!

**Q: Can I revoke access remotely?**

A: Yes, go to GitHub/Smithery settings and revoke the OAuth app's access. Gateway will need re-authentication.

## Support

For issues or questions:

- Check logs: `~/.mcp/logs/`
- GitHub Issues: https://github.com/your-repo/mcp-gateway/issues
- Documentation: https://docs.mcp-gateway.com
