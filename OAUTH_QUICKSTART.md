# OAuth Quick Start

**TL;DR**: Set up OAuth authentication for your MCP Gateway in 5 minutes.

## Prerequisites

- MCP Gateway installed
- GitHub or Smithery account
- 5 minutes

## Steps

### 1. Register OAuth App

**GitHub:** https://github.com/settings/developers → "New OAuth App"
- Callback URL: `http://localhost:3000/oauth/github/callback`

**Smithery:** https://smithery.ai/settings/oauth → "Create OAuth App"
- Redirect URI: `http://localhost:3000/oauth/smithery/callback`

Copy **Client ID** and **Client Secret**.

### 2. Configure Environment

Edit `.env`:

```bash
# GitHub
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/oauth/github/callback

# Smithery
SMITHERY_CLIENT_ID=your_client_id
SMITHERY_CLIENT_SECRET=your_client_secret
SMITHERY_REDIRECT_URI=http://localhost:3000/oauth/smithery/callback

# Auto-generated on first run if empty
TOKEN_ENCRYPTION_KEY=
```

### 3. Configure Backend

Edit `registry.json`:

```json
{
  "backends": {
    "github": {
      "type": "npx",
      "install": { "package": "@modelcontextprotocol/server-github" },
      "runtime": {
        "env": { "GITHUB_TOKEN": "${GITHUB_ACCESS_TOKEN}" }
      },
      "auth": {
        "type": "oauth",
        "provider": "github",
        "scopes": ["repo", "read:org"],
        "tokenRefresh": true
      },
      "enabled": true
    }
  }
}
```

### 4. Start & Connect

```bash
# Start gateway
cd server && npm start

# Open browser to connect
open http://localhost:3000/oauth/github/start

# Or use curl to check status
curl http://localhost:3000/oauth/github/status
```

### 5. Done!

Your backend now has automatic OAuth authentication with:
- ✅ Encrypted token storage
- ✅ Auto token refresh
- ✅ Secure HTTPS (in production)

## Available Endpoints

```bash
# Start OAuth
GET /oauth/{github|smithery}/start

# Connection status
GET /oauth/{github|smithery}/status

# Refresh token
POST /oauth/{github|smithery}/refresh

# Disconnect
POST /oauth/{github|smithery}/disconnect

# All providers status
GET /oauth/status
```

## Environment Variables in Registry

Use these in your `registry.json`:

- `${GITHUB_ACCESS_TOKEN}` - Auto-managed GitHub token
- `${SMITHERY_ACCESS_TOKEN}` - Auto-managed Smithery token

Example:
```json
{
  "runtime": {
    "env": {
      "GITHUB_TOKEN": "${GITHUB_ACCESS_TOKEN}",
      "API_KEY": "${SMITHERY_ACCESS_TOKEN}"
    }
  }
}
```

## Troubleshooting

**"OAuth credentials not configured"**
→ Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env`

**"Token not found"**
→ Go to `http://localhost:3000/oauth/github/start` to connect

**"Token expired"**
→ Gateway auto-refreshes. Check logs or manually refresh:
```bash
curl -X POST http://localhost:3000/oauth/github/refresh
```

## Security Notes

- ✅ Tokens encrypted with AES-256-GCM
- ✅ Stored at `~/.mcp/tokens.enc`
- ✅ Never commit `.env` to git
- ✅ Use HTTPS in production
- ✅ Rotate encryption key periodically

## Full Documentation

- **Setup Guide**: `docs/oauth-setup.md`
- **Technical Docs**: `server/src/oauth/README.md`
- **Implementation**: `OAUTH_IMPLEMENTATION.md`

## Production Deployment

Update redirect URIs to production domain:

```bash
# .env
GITHUB_REDIRECT_URI=https://mcp-gateway.yourdomain.com/oauth/github/callback
NODE_ENV=production
```

Update OAuth app settings on GitHub/Smithery to match.

---

**Need help?** Check the full guides in `docs/` or open an issue.
