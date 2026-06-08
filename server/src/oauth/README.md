# OAuth Integration

Complete OAuth 2.0 integration for the MCP Gateway with encrypted token storage and automatic token refresh.

## Features

- **Encrypted Token Storage**: AES-256-GCM encryption for secure token storage
- **Auto Token Refresh**: Background job refreshes tokens before expiry
- **Multiple Providers**: GitHub and Smithery (extensible)
- **Event-Driven**: Emits events for token refresh and errors
- **Environment Variable Resolution**: Backends automatically get tokens via `${GITHUB_ACCESS_TOKEN}` etc.

## Architecture

```
User Browser
     ↓
Gateway OAuth Routes (/oauth/github/start)
     ↓
OAuth Provider (GitHub/Smithery)
     ↓
Gateway Callback (/oauth/github/callback)
     ↓
Token Store (Encrypted ~/.mcp/tokens.enc)
     ↓
Registry Resolution (${GITHUB_ACCESS_TOKEN})
     ↓
Backend Receives Token
```

## Setup

### 1. Register OAuth Apps

#### GitHub
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - Application name: `MCP Gateway`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/oauth/github/callback`
4. Save and copy the Client ID and Client Secret

#### Smithery
1. Go to https://smithery.ai/settings/oauth
2. Click "Create OAuth App"
3. Fill in:
   - Application name: `MCP Gateway`
   - Redirect URI: `http://localhost:3000/oauth/smithery/callback`
4. Save and copy the Client ID and Client Secret

### 2. Configure Environment

Add to `.env`:

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/oauth/github/callback

# Smithery OAuth
SMITHERY_CLIENT_ID=your_smithery_client_id
SMITHERY_CLIENT_SECRET=your_smithery_client_secret
SMITHERY_REDIRECT_URI=http://localhost:3000/oauth/smithery/callback

# Auto-generated encryption key (or provide your own)
TOKEN_ENCRYPTION_KEY=
```

If `TOKEN_ENCRYPTION_KEY` is not provided, one will be auto-generated on first run.

### 3. Use in Registry

Reference OAuth tokens in `registry.json`:

```json
{
  "backends": {
    "github": {
      "name": "GitHub MCP",
      "type": "npx",
      "install": {
        "package": "@modelcontextprotocol/server-github"
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

## OAuth Flow

### User Authentication

1. User clicks "Connect GitHub" in UI
2. UI opens `/oauth/github/start`
3. Gateway redirects to GitHub authorize page
4. User approves permissions
5. GitHub redirects to `/oauth/github/callback?code=...`
6. Gateway exchanges code for tokens
7. Tokens encrypted and saved to `~/.mcp/tokens.enc`
8. Gateway redirects to UI with success
9. Backend starts and receives token via `${GITHUB_ACCESS_TOKEN}`

### Auto Token Refresh

1. Background job runs every hour (configurable)
2. Checks all tokens for expiry
3. If token expires in < 1 hour, triggers refresh
4. Refreshes token using refresh token
5. Saves new token encrypted
6. Emits `token:refreshed` event
7. Next backend restart will get new token

## API Endpoints

### GitHub

- `GET /oauth/github/start?scopes=repo,read:org` - Start OAuth flow
- `GET /oauth/github/callback?code=...` - OAuth callback (redirect)
- `POST /oauth/github/refresh` - Manually refresh token
- `POST /oauth/github/disconnect` - Disconnect and delete token
- `GET /oauth/github/status` - Get connection status

### Smithery

- `GET /oauth/smithery/start?scopes=read,write` - Start OAuth flow
- `GET /oauth/smithery/callback?code=...` - OAuth callback (redirect)
- `POST /oauth/smithery/refresh` - Manually refresh token
- `POST /oauth/smithery/disconnect` - Disconnect and delete token
- `GET /oauth/smithery/status` - Get connection status

### General

- `GET /oauth/status` - Get status for all providers

## Token Storage

### Location

Tokens are stored encrypted at:
```
~/.mcp/tokens.enc
```

### Format

Internal format (decrypted):

```json
{
  "github": {
    "provider": "github",
    "access_token": "gho_...",
    "refresh_token": "ghr_...",
    "expires_at": "2024-01-01T00:00:00.000Z",
    "scopes": ["repo", "read:org"],
    "created_at": 1234567890,
    "updated_at": 1234567890,
    "user_info": {
      "login": "username",
      "id": 12345
    }
  },
  "smithery": {
    "provider": "smithery",
    "access_token": "smt_...",
    "refresh_token": "smr_...",
    "expires_at": "2024-01-01T00:00:00.000Z",
    "scopes": ["read", "write"],
    "created_at": 1234567890,
    "updated_at": 1234567890
  }
}
```

### Encryption

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 with SHA-256 (100,000 iterations)
- Random salt and IV per encryption
- Authentication tag for integrity

## Security

### Best Practices

1. **Never commit `.env` to version control**
2. **Use HTTPS in production** (update redirect URIs)
3. **Rotate encryption key periodically**
4. **Limit OAuth scopes** to minimum required
5. **Monitor token refresh failures** (could indicate compromise)

### Remote Deployment

For production remote deployment:

1. Update redirect URIs to production domain:
   ```bash
   GITHUB_REDIRECT_URI=https://mcp-gateway.yourdomain.com/oauth/github/callback
   SMITHERY_REDIRECT_URI=https://mcp-gateway.yourdomain.com/oauth/smithery/callback
   ```

2. Use HTTPS (add nginx/caddy reverse proxy)

3. Enable secure cookies (set `NODE_ENV=production`)

4. Restrict access with `ENABLE_AUTH=true` and `GATEWAY_API_KEY`

## Events

The OAuth manager emits events that you can listen to:

```javascript
import { getOAuthManager } from './oauth/index.js';

const oauthManager = getOAuthManager();

// Token refreshed successfully
oauthManager.on('token:refreshed', ({ provider, expiresAt }) => {
  console.log(`Token refreshed for ${provider}, expires at ${expiresAt}`);
});

// Token refresh failed
oauthManager.on('token:refresh_failed', ({ provider, error }) => {
  console.error(`Token refresh failed for ${provider}: ${error}`);
  // Maybe send alert, notify user, etc.
});
```

## Troubleshooting

### Token not found

**Symptom**: Backend logs "OAuth token not found for: github"

**Solution**: 
1. Check if user has connected: `GET /oauth/github/status`
2. If not connected, user must go through OAuth flow
3. Check `.env` for correct CLIENT_ID and CLIENT_SECRET

### Token expired

**Symptom**: Backend gets 401 Unauthorized errors

**Solution**:
1. Check token status: `GET /oauth/github/status`
2. Manually refresh: `POST /oauth/github/refresh`
3. If no refresh token, user must re-authenticate
4. Check if auto-refresh is running (should log every hour)

### Encryption key error

**Symptom**: "TOKEN_ENCRYPTION_KEY must be 32 bytes"

**Solution**:
1. Generate new key: `openssl rand -hex 32`
2. Add to `.env`: `TOKEN_ENCRYPTION_KEY=<generated_key>`
3. If changing key, existing tokens will be lost (users must re-authenticate)

### OAuth callback error

**Symptom**: "State mismatch in OAuth callback"

**Solution**:
1. Clear browser cookies
2. Check if gateway is behind a proxy that strips cookies
3. Try with `ENABLE_AUTH=false` first
4. Check if CLIENT_ID matches OAuth app

### Token not resolving in registry

**Symptom**: Backend gets empty token value

**Solution**:
1. Check if token exists: `GET /oauth/github/status`
2. Verify registry uses correct variable: `${GITHUB_ACCESS_TOKEN}`
3. Check logs for "Unresolved environment variable" warnings
4. Restart gateway after connecting OAuth (to reload registry)

## Adding New Providers

To add a new OAuth provider (e.g., Google, GitLab):

1. Create `server/src/oauth/provider-name.js` based on `github.js`
2. Update provider URLs and credential functions
3. Add routes to `server/src/oauth/index.js`
4. Add token resolution in `server/src/mcp/registry.js` (e.g., `${GOOGLE_ACCESS_TOKEN}`)
5. Add credentials to `.env.example`
6. Update this README

Example for GitLab:

```javascript
// server/src/oauth/gitlab.js
const GITLAB_AUTHORIZE_URL = 'https://gitlab.com/oauth/authorize';
const GITLAB_TOKEN_URL = 'https://gitlab.com/oauth/token';
const GITLAB_USER_URL = 'https://gitlab.com/api/v4/user';

function getGitLabCredentials() {
  return {
    clientId: process.env.GITLAB_CLIENT_ID,
    clientSecret: process.env.GITLAB_CLIENT_SECRET,
    redirectUri: process.env.GITLAB_REDIRECT_URI
  };
}

// ... implement same functions as github.js
```

## Testing

Test the OAuth flow manually:

```bash
# Start gateway
npm run dev

# Open browser to start OAuth
open http://localhost:3000/oauth/github/start

# Check status after authentication
curl http://localhost:3000/oauth/github/status

# Test token refresh
curl -X POST http://localhost:3000/oauth/github/refresh

# Test disconnect
curl -X POST http://localhost:3000/oauth/github/disconnect
```

## Production Checklist

- [ ] OAuth apps registered with production URLs
- [ ] Environment variables set in production `.env`
- [ ] Redirect URIs use HTTPS
- [ ] `NODE_ENV=production` set
- [ ] Secure cookies enabled
- [ ] Gateway behind HTTPS reverse proxy
- [ ] `TOKEN_ENCRYPTION_KEY` securely generated and stored
- [ ] Monitoring set up for token refresh failures
- [ ] Backup plan for `~/.mcp/tokens.enc`
