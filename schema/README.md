# MCP Gateway Registry Schema

This directory contains the JSON Schema definition for the MCP Gateway registry format.

## Files

- **registry-v2.schema.json** - Complete JSON Schema Draft 7 specification
- **README.md** - This file

## Schema Overview

The registry schema validates:

1. **11 Backend Types** - npx, uvx, pipx, docker, git-npm, git-python, git-docker, local, remote-sse, remote-http, shell
2. **Discriminated Unions** - Each backend type has specific required fields
3. **Environment Variables** - Pattern validation for `${VAR_NAME}` syntax
4. **Git URLs** - Validation for HTTPS and SSH formats
5. **Docker Images** - Registry/image:tag format validation
6. **Gateway Configuration** - Server, storage, logging, OAuth, and security settings

## Usage

### Command Line Validation

```bash
# Validate default registry.json
npm run validate

# Validate specific file
node server/src/validation/validate-registry.js path/to/registry.json
```

### Programmatic Validation

```javascript
import { validateRegistry, validateBackend } from './server/src/validation/index.js';

// Validate entire registry
try {
  const result = validateRegistry(registryObject);
  console.log('Valid!', result.warnings);
} catch (error) {
  console.error('Invalid:', error.validationErrors);
}

// Validate single backend
const result = validateBackend('my-backend', backendConfig);
if (!result.valid) {
  console.error(result.errors);
}
```

## Backend Types

### NPX Backend

```json
{
  "type": "npx",
  "name": "Backend Name",
  "description": "What it does",
  "install": {
    "package": "@scope/package-name",
    "version": "1.0.0"
  },
  "runtime": {
    "args": ["--flag"],
    "env": {
      "API_KEY": "${API_KEY}"
    }
  },
  "lifecycle": "on-demand",
  "enabled": true
}
```

### Docker Backend

```json
{
  "type": "docker",
  "name": "Backend Name",
  "description": "What it does",
  "install": {
    "image": "ghcr.io/user/image",
    "tag": "latest",
    "pull": "missing"
  },
  "runtime": {
    "volumes": ["${HOME}/data:/data:ro"],
    "ports": { "8080": 8080 },
    "env": {
      "API_KEY": "${API_KEY}"
    }
  },
  "healthcheck": {
    "endpoint": "http://localhost:8080/health",
    "interval": 30,
    "timeout": 5,
    "retries": 3
  },
  "lifecycle": "persistent",
  "enabled": true
}
```

### Git NPM Backend

```json
{
  "type": "git-npm",
  "name": "Backend Name",
  "description": "What it does",
  "install": {
    "repository": "https://github.com/user/repo.git",
    "branch": "main",
    "build": {
      "steps": ["npm install", "npm run build"],
      "entrypoint": "dist/index.js"
    }
  },
  "runtime": {
    "command": "node",
    "args": ["--experimental-modules"],
    "env": {
      "NODE_ENV": "production"
    }
  },
  "lifecycle": "persistent",
  "enabled": true
}
```

### Remote SSE Backend

```json
{
  "type": "remote-sse",
  "name": "Backend Name",
  "description": "What it does",
  "install": {
    "url": "https://api.smithery.ai/sse"
  },
  "runtime": {
    "headers": {
      "Authorization": "Bearer ${SMITHERY_ACCESS_TOKEN}"
    },
    "timeout": 30000
  },
  "auth": {
    "type": "oauth",
    "provider": "smithery",
    "scopes": ["read", "write"],
    "tokenRefresh": true
  },
  "lifecycle": "persistent",
  "enabled": true
}
```

## Validation Rules

### Backend ID Pattern

Backend IDs must match: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`

- Lowercase alphanumeric + hyphens
- Cannot start or end with hyphen
- Examples: `obs`, `github-api`, `mcp-server-1`

### Environment Variables

Variables must use `${VAR_NAME}` syntax where VAR_NAME matches: `^[A-Z_][A-Z0-9_]*$`

- All uppercase
- Underscores allowed
- Must start with letter or underscore
- Examples: `${API_KEY}`, `${GITHUB_TOKEN}`, `${HOME}`

### Git Repository URLs

Must be valid HTTPS or SSH format:

- HTTPS: `https://github.com/user/repo.git`
- SSH: `git@github.com:user/repo.git`

### Docker Images

Must match registry/namespace/image format:

- `ubuntu`
- `ubuntu:20.04`
- `ghcr.io/user/image:tag`
- `registry.example.com:5000/path/image:tag`

### NPM Packages

Must match package name format:

- `package-name`
- `@scope/package-name`

## Error Messages

The validator provides helpful error messages with suggestions:

```
❌ Registry validation failed:

  Backend "my-backend":
    ├─ lifecycle: Invalid value: "maybe". Must be one of: on-demand, persistent
    │  💡 Update backends.my-backend.lifecycle to use a valid value
    │  Current value: maybe

    ├─ install.repository: Invalid git repository URL: "not-a-git-url"
    │  💡 Use HTTPS (https://...) or SSH (git@...) format

    ├─ runtime.env.bad_var: Invalid environment variable syntax: ${bad}
    │  💡 Environment variables must use ${UPPERCASE_WITH_UNDERSCORES} syntax
```

## Semantic Validation

Beyond schema validation, the validator checks:

1. **Duplicate backend names** (warning)
2. **OAuth config mismatch** - Backend requires OAuth but gateway config missing (error)
3. **Invalid git build config** - Missing steps or entrypoint (error)
4. **Invalid Docker volumes** - Missing colon separator (error)
5. **OAuth with on-demand lifecycle** - May cause auth delays (warning)

## Gateway Configuration

### Server

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "transport": "sse",
    "cors": {
      "enabled": true,
      "origins": ["*"],
      "credentials": true
    }
  }
}
```

### Storage

```json
{
  "storage": {
    "repos": "${HOME}/.mcp/repos",
    "cache": "${HOME}/.mcp/cache",
    "logs": "${HOME}/.mcp/logs"
  }
}
```

### Logging

```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "outputs": ["console", "file"]
  }
}
```

### OAuth

```json
{
  "oauth": {
    "providers": {
      "github": {
        "clientId": "${GITHUB_CLIENT_ID}",
        "clientSecret": "${GITHUB_CLIENT_SECRET}",
        "callbackUrl": "http://localhost:3000/oauth/github/callback"
      },
      "smithery": {
        "clientId": "${SMITHERY_CLIENT_ID}",
        "clientSecret": "${SMITHERY_CLIENT_SECRET}",
        "callbackUrl": "http://localhost:3000/oauth/smithery/callback"
      }
    }
  }
}
```

### Security

```json
{
  "security": {
    "apiKey": "${GATEWAY_API_KEY}",
    "enableAuth": false,
    "allowedIPs": ["192.168.1.0/24"]
  }
}
```

## TypeScript Types

See `types/registry.d.ts` for complete TypeScript type definitions matching this schema.

Type guards are provided for runtime type checking:

```typescript
import { Backend, isBackendType, hasOAuth, isGitBackend } from './types/registry';

if (isBackendType(backend, 'docker')) {
  // backend is DockerBackend
  console.log(backend.install.image);
}

if (hasOAuth(backend)) {
  // backend has auth.type === 'oauth'
  console.log(backend.auth.provider);
}

if (isGitBackend(backend)) {
  // backend is GitNpmBackend | GitPythonBackend | GitDockerBackend
  console.log(backend.install.repository);
}
```

## Schema Updates

When updating the schema:

1. Update `schema/registry-v2.schema.json`
2. Update `types/registry.d.ts` to match
3. Update validation tests
4. Update this README with new examples
5. Run validation tests: `npm run validate`

## References

- [JSON Schema Draft 7](https://json-schema.org/draft-07/json-schema-release-notes.html)
- [Ajv Documentation](https://ajv.js.org/)
- [MCP Specification](https://modelcontextprotocol.io/)
