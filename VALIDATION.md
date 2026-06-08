# MCP Gateway Schema Validation

This document describes the schema validation system for the MCP Gateway registry.

## Overview

The validation system ensures that `registry.json` configurations are correct before the gateway starts. It uses JSON Schema Draft 7 with Ajv for validation, providing helpful error messages and semantic checks.

## Components

### 1. JSON Schema (`schema/registry-v2.schema.json`)

Complete specification for the registry format:
- 11 backend types with discriminated unions
- Environment variable pattern validation (`${VAR_NAME}`)
- Git URL format validation (HTTPS and SSH)
- Docker image format validation
- Gateway configuration (server, storage, logging, OAuth, security)

### 2. TypeScript Definitions (`types/registry.d.ts`)

Type-safe definitions for TypeScript/JavaScript projects:
- Discriminated unions for all backend types
- Type guards for runtime type checking
- Exported types for server and UI components

### 3. Validation Module (`server/src/validation/`)

Runtime validation using Ajv:
- Schema validation with custom formats
- Semantic validation (OAuth config, build config, etc.)
- Helpful error messages with suggestions
- CLI tool for manual validation

## Usage

### Command Line

```bash
# Validate default registry.json
npm run validate

# Validate specific file
node server/src/validation/validate-registry.js path/to/registry.json

# Example output
📋 Validating default registry: /path/to/registry.json

✅ Registry validation passed!

   No issues found

📊 Registry Statistics:
   Total backends: 5
   Enabled: 2 | Disabled: 3
   On-demand: 2 | Persistent: 3

   By type:
     docker          1
     git-npm         1
     npx             3
```

### Programmatic

```javascript
import { validateRegistry, validateBackend } from './server/src/validation/index.js';

// Validate entire registry
try {
  const result = validateRegistry(registryObject);
  console.log('Valid!', result.warnings);
} catch (error) {
  console.error('Validation errors:', error.validationErrors);
  console.error('Semantic errors:', error.semanticErrors);
}

// Validate single backend (useful for UI)
const result = validateBackend('backend-id', backendConfig);
if (result.valid) {
  console.log('Backend is valid');
} else {
  console.error('Backend errors:', result.errors);
}
```

### TypeScript Type Checking

```typescript
import type { Registry, Backend, NpxBackend } from './types/registry';
import { isBackendType, hasOAuth, isGitBackend } from './types/registry';

// Load registry with type safety
const registry: Registry = await loadRegistry();

// Type-safe access
for (const [id, backend] of Object.entries(registry.backends)) {
  if (isBackendType(backend, 'npx')) {
    // TypeScript knows backend is NpxBackend
    console.log(backend.install.package);
  }
  
  if (hasOAuth(backend)) {
    // TypeScript knows backend.auth exists
    console.log(backend.auth.provider);
  }
  
  if (isGitBackend(backend)) {
    // TypeScript knows backend.install.repository exists
    console.log(backend.install.repository);
  }
}
```

## Validation Rules

### Backend IDs

Pattern: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`

Valid:
- `obs`
- `github-api`
- `mcp-server-1`

Invalid:
- `OBS` (uppercase)
- `-obs` (starts with hyphen)
- `obs-` (ends with hyphen)
- `obs_studio` (underscore)

### Environment Variables

Pattern: `${VAR_NAME}` where VAR_NAME matches `^[A-Z_][A-Z0-9_]*$`

Valid:
- `${API_KEY}`
- `${GITHUB_TOKEN}`
- `${_PRIVATE_VAR}`
- `${HOME}`

Invalid:
- `$API_KEY` (missing braces)
- `${api_key}` (lowercase)
- `${123VAR}` (starts with number)
- `$(VAR)` (wrong syntax)

### Git URLs

Valid:
- `https://github.com/user/repo.git`
- `https://gitlab.com/user/repo.git`
- `git@github.com:user/repo.git`

Invalid:
- `https://github.com/user/repo` (missing .git)
- `github.com/user/repo.git` (missing protocol)
- `git://github.com/user/repo.git` (unsupported protocol)

### Docker Images

Valid:
- `ubuntu`
- `ubuntu:20.04`
- `ghcr.io/user/image`
- `ghcr.io/user/image:tag`
- `registry.example.com:5000/path/image:tag`

Invalid:
- `UBUNTU` (uppercase)
- `user/image:` (empty tag)
- `image::tag` (double colon)

### NPM Packages

Valid:
- `package-name`
- `@scope/package-name`
- `@org/nested-package`

Invalid:
- `Package-Name` (uppercase)
- `@scope/Package` (uppercase in name)
- `package_name` (underscore not in scope)

## Error Messages

The validator provides actionable error messages:

```
❌ Registry validation failed:

  Backend "my-backend":
    ├─ lifecycle: Invalid value: "maybe". Must be one of: on-demand, persistent
    │  💡 Update backends.my-backend.lifecycle to use a valid value
    │  Current value: maybe

    ├─ install.repository: Invalid git repository URL: "not-a-url"
    │  💡 Use HTTPS (https://...) or SSH (git@...) format

    ├─ runtime.env.BAD_VAR: Invalid environment variable syntax: $bad
    │  💡 Environment variables must use ${UPPERCASE_WITH_UNDERSCORES} syntax
```

## Semantic Validation

Beyond schema validation, the system checks:

### 1. OAuth Configuration Mismatch (Error)

Backend requires OAuth but gateway config is missing:

```json
{
  "backends": {
    "github": {
      "auth": {
        "type": "oauth",
        "provider": "github"
      }
    }
  },
  "gateway": {
    "oauth": {
      // Missing providers.github config
    }
  }
}
```

Error:
```
❌ Backend "github": Backend uses OAuth provider "github" but 
   gateway.oauth.providers.github is not configured
💡 Add github configuration to gateway.oauth.providers
```

### 2. Invalid Git Build Config (Error)

Git backends missing build steps or entrypoint:

```json
{
  "type": "git-npm",
  "install": {
    "repository": "https://github.com/user/repo.git",
    "build": {
      // Missing steps and entrypoint
    }
  }
}
```

### 3. Invalid Docker Volumes (Error)

Volume mount missing colon separator:

```json
{
  "type": "docker",
  "runtime": {
    "volumes": [
      "/host/path"  // Missing :/container/path
    ]
  }
}
```

### 4. Duplicate Backend Names (Warning)

Multiple backends with the same name:

```json
{
  "backends": {
    "backend-1": { "name": "My Backend" },
    "backend-2": { "name": "My Backend" }  // Duplicate
  }
}
```

Warning:
```
⚠️  Backend "backend-2": Duplicate backend name: "My Backend"
💡 Backend names should be unique for clarity
```

### 5. OAuth with On-Demand Lifecycle (Warning)

OAuth backends configured as on-demand may have auth delays:

```json
{
  "type": "npx",
  "auth": { "type": "oauth", "provider": "github" },
  "lifecycle": "on-demand"  // May cause delays
}
```

Warning:
```
⚠️  Backend "github": OAuth backend with on-demand lifecycle may 
   have authentication delays
💡 Consider using lifecycle: "persistent" for OAuth backends
```

## Testing

Run the test suite:

```bash
npm test
```

Test coverage includes:
- Valid registries (minimal, npx, docker, git-npm, OAuth)
- Invalid registries (missing fields, wrong types, bad patterns)
- Semantic validation (OAuth mismatch, build config)
- Backend-only validation helper

## Integration

### Server Startup

The server should validate the registry on startup:

```javascript
import { validateRegistryFile } from './validation/index.js';

async function startServer() {
  try {
    // Validate before starting
    await validateRegistryFile('./registry.json');
    
    // Load and start server
    const registry = await loadRegistry();
    startGateway(registry);
  } catch (error) {
    console.error('Invalid registry, cannot start server');
    process.exit(1);
  }
}
```

### UI Integration

The UI can use `validateBackend` for real-time validation:

```javascript
import { validateBackend } from './validation/index.js';

function BackendEditor({ backendId, backend, onChange }) {
  const [errors, setErrors] = useState([]);
  
  useEffect(() => {
    const result = validateBackend(backendId, backend);
    setErrors(result.errors);
  }, [backendId, backend]);
  
  return (
    <form>
      {/* Form fields */}
      {errors.map(error => (
        <div className="error">
          {error.message}
          {error.suggestion && <p>{error.suggestion}</p>}
        </div>
      ))}
    </form>
  );
}
```

### CI/CD

Add validation to your CI pipeline:

```yaml
# .github/workflows/validate.yml
name: Validate Registry
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run validate
```

## Custom Validators

The validation system includes custom Ajv validators:

### env-var

Validates environment variable syntax:
```javascript
ajv.addFormat('env-var', {
  validate: (value) => {
    const envVarPattern = /^\$\{[A-Z_][A-Z0-9_]*\}$/;
    return envVarPattern.test(value);
  }
});
```

### git-url

Validates git repository URLs:
```javascript
ajv.addFormat('git-url', {
  validate: (value) => {
    const httpsPattern = /^https?:\/\/[^\s]+\.git$/;
    const sshPattern = /^git@[^\s:]+:[^\s]+\.git$/;
    return httpsPattern.test(value) || sshPattern.test(value);
  }
});
```

### docker-image

Validates docker image names:
```javascript
ajv.addFormat('docker-image', {
  validate: (value) => {
    const pattern = /^([a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?\/)*[a-z0-9]+([._-][a-z0-9]+)*$/;
    return pattern.test(value);
  }
});
```

## Extending the Schema

To add a new backend type:

1. Add definition to `schema/registry-v2.schema.json`:

```json
{
  "definitions": {
    "MyNewBackend": {
      "allOf": [
        { "$ref": "#/definitions/BaseBackend" },
        {
          "type": "object",
          "required": ["install"],
          "properties": {
            "type": { "const": "my-new-type" },
            "install": {
              "type": "object",
              "required": ["someField"],
              "properties": {
                "someField": { "type": "string" }
              }
            }
          }
        }
      ]
    }
  }
}
```

2. Add to backends oneOf array:

```json
{
  "backends": {
    "patternProperties": {
      "^[a-z0-9][a-z0-9-]*[a-z0-9]$": {
        "oneOf": [
          { "$ref": "#/definitions/NpxBackend" },
          { "$ref": "#/definitions/MyNewBackend" },
          ...
        ]
      }
    }
  }
}
```

3. Add TypeScript type to `types/registry.d.ts`:

```typescript
export interface MyNewBackend extends BaseBackend {
  type: 'my-new-type';
  install: {
    someField: string;
  };
}

export type Backend =
  | NpxBackend
  | MyNewBackend
  | ...;
```

4. Add tests to `server/tests/validation.test.js`

5. Update documentation

## Troubleshooting

### Schema Validation Errors

If you see strict mode errors from Ajv:
```
Error: strict mode: required property "type" is not defined
```

This means the schema has an issue. Check that:
- All referenced definitions exist
- Required properties are defined in the schema
- allOf/oneOf references are correct

### False Positives

If valid configs fail validation:
- Check the error message for the specific issue
- Verify the format matches the schema pattern
- Check for typos in field names

### Performance

For large registries (100+ backends):
- Validation should complete in <1 second
- If slower, check for regex backtracking in patterns
- Consider disabling verbose mode in production

## Resources

- [JSON Schema Reference](https://json-schema.org/)
- [Ajv Documentation](https://ajv.js.org/)
- [Schema README](schema/README.md)
- [Type Definitions](types/registry.d.ts)
