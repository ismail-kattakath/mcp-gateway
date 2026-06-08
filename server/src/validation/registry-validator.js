/**
 * MCP Gateway Registry Validator
 *
 * Validates registry.json against the JSON Schema with custom validators
 * for environment variables, git URLs, docker images, and more.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Ajv with all errors and helpful options
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  strictSchema: false,
  $data: true,
  discriminator: true,
  removeAdditional: false,
});

// Add standard format validators (uri, email, etc.)
addFormats(ajv);

// Custom format validators
ajv.addFormat('env-var', {
  validate: (value) => {
    if (typeof value !== 'string') return true; // Type validation is separate
    // Allow plain strings or ${VAR_NAME} syntax
    const envVarPattern = /^\$\{[A-Z_][A-Z0-9_]*\}$/;
    const plainPattern = /^[^$].*$/; // Doesn't start with $
    const mixedPattern = /^.*\$\{[A-Z_][A-Z0-9_]*\}.*$/; // Contains ${VAR}

    return envVarPattern.test(value) || plainPattern.test(value) || mixedPattern.test(value);
  }
});

ajv.addFormat('git-url', {
  validate: (value) => {
    if (typeof value !== 'string') return true;
    // HTTPS: https://github.com/user/repo.git
    const httpsPattern = /^https?:\/\/[^\s]+\.git$/;
    // SSH: git@github.com:user/repo.git
    const sshPattern = /^git@[^\s:]+:[^\s]+\.git$/;
    return httpsPattern.test(value) || sshPattern.test(value);
  }
});

ajv.addFormat('docker-image', {
  validate: (value) => {
    if (typeof value !== 'string') return true;
    // Examples:
    // - ubuntu
    // - ubuntu:20.04
    // - ghcr.io/user/image
    // - ghcr.io/user/image:tag
    // - registry.example.com:5000/path/image:tag
    const pattern = /^([a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?\/)*[a-z0-9]+([._-][a-z0-9]+)*$/;
    return pattern.test(value);
  }
});

ajv.addFormat('npm-package', {
  validate: (value) => {
    if (typeof value !== 'string') return true;
    // Matches: package, @scope/package
    const pattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    return pattern.test(value);
  }
});

ajv.addFormat('backend-id', {
  validate: (value) => {
    if (typeof value !== 'string') return true;
    // Lowercase alphanumeric + hyphens, can't start/end with hyphen
    const pattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    return pattern.test(value);
  }
});

// Custom keyword for validating all env values recursively
ajv.addKeyword({
  keyword: 'validateEnvVars',
  type: 'object',
  schemaType: 'boolean',
  validate: function validateEnvVars(schemaValue, data, parentSchema, context) {
    if (!schemaValue) return true;

    const errors = [];

    function checkValue(val, path) {
      if (typeof val === 'string' && val.includes('${')) {
        // Check for malformed env var syntax
        const matches = val.match(/\$\{[^}]*\}/g);
        if (matches) {
          for (const match of matches) {
            const varName = match.slice(2, -1); // Remove ${ and }
            if (!/^[A-Z_][A-Z0-9_]*$/.test(varName)) {
              errors.push({
                path,
                message: `Invalid environment variable syntax: ${match}. Must be \${UPPERCASE_WITH_UNDERSCORES}`
              });
            }
          }
        }
      }
    }

    function traverse(obj, currentPath = []) {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = [...currentPath, key];
        if (typeof value === 'string') {
          checkValue(value, newPath.join('.'));
        } else if (value && typeof value === 'object') {
          traverse(value, newPath);
        }
      }
    }

    traverse(data);

    if (errors.length > 0) {
      validateEnvVars.errors = errors.map(err => ({
        keyword: 'validateEnvVars',
        message: err.message,
        params: { path: err.path }
      }));
      return false;
    }

    return true;
  }
});

// Load schema
let registrySchema;
try {
  const schemaPath = path.resolve(__dirname, '../../../schema/registry-v2.schema.json');
  const schemaContent = await fs.readFile(schemaPath, 'utf-8');
  registrySchema = JSON.parse(schemaContent);
} catch (error) {
  throw new Error(`Failed to load registry schema: ${error.message}`);
}

const validate = ajv.compile(registrySchema);

/**
 * Custom error formatting for better user experience
 */
function formatValidationErrors(errors, registry) {
  const formatted = [];
  const seen = new Set();

  for (const error of errors) {
    const instancePath = error.instancePath || '/';
    const location = instancePath.replace(/^\//, '').replace(/\//g, '.');

    let message = '';
    let suggestion = '';

    // Skip duplicate oneOf errors - we only need one
    if (error.keyword === 'oneOf') {
      const key = `${location}:oneOf`;
      if (seen.has(key)) continue;
      seen.add(key);
    }

    // Skip const errors from oneOf branches - these are internal
    if (error.keyword === 'const' && error.parentSchema?.const) {
      continue;
    }

    switch (error.keyword) {
      case 'required':
        message = `Missing required field: ${error.params.missingProperty}`;
        suggestion = `Add "${error.params.missingProperty}" to ${location || 'root'}`;
        break;

      case 'enum':
        message = `Invalid value: "${error.data}". Must be one of: ${error.params.allowedValues.join(', ')}`;
        suggestion = `Update ${location} to use a valid value`;
        break;

      case 'pattern':
        message = `Value "${error.data}" does not match required pattern`;
        if (location.includes('repository')) {
          suggestion = 'Use format: https://github.com/user/repo.git or git@github.com:user/repo.git';
        } else if (location.includes('image')) {
          suggestion = 'Use format: registry/name or name:tag';
        } else if (location.includes('package')) {
          suggestion = 'Use format: package-name or @scope/package-name';
        }
        break;

      case 'type':
        message = `Invalid type: expected ${error.params.type} but got ${typeof error.data}`;
        break;

      case 'oneOf':
        message = 'Backend configuration does not match any valid backend type';
        suggestion = 'Check that "type" field matches the install/runtime configuration';
        break;

      case 'additionalProperties':
        message = `Unknown property: "${error.params.additionalProperty}"`;
        suggestion = 'Remove this property or check for typos';
        break;

      case 'format':
        if (error.params.format === 'uri') {
          message = `Invalid URL: "${error.data}"`;
          suggestion = 'Must be a valid HTTP/HTTPS URL';
        } else if (error.params.format === 'git-url') {
          message = `Invalid git repository URL: "${error.data}"`;
          suggestion = 'Use HTTPS (https://...) or SSH (git@...) format';
        } else {
          message = `Invalid format: ${error.params.format}`;
        }
        break;

      case 'validateEnvVars':
        message = error.message;
        suggestion = 'Environment variables must use ${UPPERCASE_WITH_UNDERSCORES} syntax';
        break;

      default:
        message = error.message || 'Validation failed';
    }

    // Deduplicate similar errors
    const key = `${location}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);

    formatted.push({
      location: location || 'root',
      message,
      suggestion,
      value: error.data
    });
  }

  return formatted;
}

/**
 * Pretty print validation errors
 */
function printValidationErrors(errors) {
  console.error('\n❌ Registry validation failed:\n');

  // Group errors by backend
  const byLocation = {};
  for (const error of errors) {
    const parts = error.location.split('.');
    const backend = parts[1] || 'root';
    if (!byLocation[backend]) {
      byLocation[backend] = [];
    }
    byLocation[backend].push(error);
  }

  for (const [location, locationErrors] of Object.entries(byLocation)) {
    if (location === 'root') {
      console.error('  Registry root:');
    } else {
      console.error(`  Backend "${location}":`);
    }

    for (const error of locationErrors) {
      const path = error.location.split('.').slice(2).join('.') || '(root)';
      console.error(`    ├─ ${path}: ${error.message}`);
      if (error.suggestion) {
        console.error(`    │  💡 ${error.suggestion}`);
      }
      if (error.value !== undefined && error.value !== null) {
        const valueStr = typeof error.value === 'object'
          ? JSON.stringify(error.value)
          : error.value;
        if (valueStr.length < 100) {
          console.error(`    │  Current value: ${valueStr}`);
        }
      }
    }
    console.error('');
  }
}

/**
 * Additional semantic validations beyond schema
 */
function validateSemantics(registry) {
  const warnings = [];
  const errors = [];

  // Check for duplicate backend names
  const names = new Set();
  for (const [id, backend] of Object.entries(registry.backends)) {
    if (names.has(backend.name)) {
      warnings.push({
        backend: id,
        message: `Duplicate backend name: "${backend.name}"`,
        suggestion: 'Backend names should be unique for clarity'
      });
    }
    names.add(backend.name);
  }

  // Check for OAuth without gateway OAuth config
  for (const [id, backend] of Object.entries(registry.backends)) {
    if (backend.auth?.type === 'oauth') {
      const provider = backend.auth.provider;
      if (!registry.gateway?.oauth?.providers?.[provider]) {
        errors.push({
          backend: id,
          message: `Backend uses OAuth provider "${provider}" but gateway.oauth.providers.${provider} is not configured`,
          suggestion: `Add ${provider} configuration to gateway.oauth.providers`
        });
      }
    }
  }

  // Check for git backends with invalid build config
  for (const [id, backend] of Object.entries(registry.backends)) {
    if (['git-npm', 'git-python', 'git-docker'].includes(backend.type)) {
      if (backend.type !== 'git-docker' && (!backend.install.build?.steps?.length || !backend.install.build?.entrypoint)) {
        errors.push({
          backend: id,
          message: 'Git backend missing required build configuration',
          suggestion: 'Add install.build.steps and install.build.entrypoint'
        });
      }
    }
  }

  // Check for docker backends with invalid volumes
  for (const [id, backend] of Object.entries(registry.backends)) {
    if ((backend.type === 'docker' || backend.type === 'git-docker') && backend.runtime?.volumes) {
      for (const volume of backend.runtime.volumes) {
        if (!volume.includes(':')) {
          errors.push({
            backend: id,
            message: `Invalid volume format: "${volume}"`,
            suggestion: 'Use format: /host/path:/container/path or /host/path:/container/path:ro'
          });
        }
      }
    }
  }

  // Check for persistent backends with on-demand OAuth
  for (const [id, backend] of Object.entries(registry.backends)) {
    if (backend.lifecycle === 'on-demand' && backend.auth?.type === 'oauth') {
      warnings.push({
        backend: id,
        message: 'OAuth backend with on-demand lifecycle may have authentication delays',
        suggestion: 'Consider using lifecycle: "persistent" for OAuth backends'
      });
    }
  }

  return { warnings, errors };
}

/**
 * Main validation function
 */
export function validateRegistry(registry) {
  // Schema validation
  const valid = validate(registry);

  if (!valid) {
    const formatted = formatValidationErrors(validate.errors, registry);
    printValidationErrors(formatted);

    const error = new Error('Registry validation failed');
    error.validationErrors = formatted;
    throw error;
  }

  // Semantic validation
  const { warnings, errors } = validateSemantics(registry);

  if (errors.length > 0) {
    console.error('\n❌ Registry semantic validation failed:\n');
    for (const error of errors) {
      console.error(`  Backend "${error.backend}":`);
      console.error(`    ├─ ${error.message}`);
      if (error.suggestion) {
        console.error(`    │  💡 ${error.suggestion}`);
      }
      console.error('');
    }

    const validationError = new Error('Registry semantic validation failed');
    validationError.semanticErrors = errors;
    throw validationError;
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Registry validation warnings:\n');
    for (const warning of warnings) {
      console.warn(`  Backend "${warning.backend}":`);
      console.warn(`    ├─ ${warning.message}`);
      if (warning.suggestion) {
        console.warn(`    │  💡 ${warning.suggestion}`);
      }
      console.warn('');
    }
  }

  return {
    valid: true,
    warnings
  };
}

/**
 * Validate registry from file path
 */
export async function validateRegistryFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const registry = JSON.parse(content);
    return validateRegistry(registry);
  } catch (error) {
    if (error.validationErrors || error.semanticErrors) {
      throw error; // Re-throw validation errors
    }
    if (error instanceof SyntaxError) {
      console.error('\n❌ Registry JSON parsing failed:\n');
      console.error(`  ${error.message}\n`);
      const parseError = new Error('Invalid JSON syntax');
      parseError.parseError = error;
      throw parseError;
    }
    throw new Error(`Failed to read registry file: ${error.message}`);
  }
}

/**
 * Get detailed backend validation for UI
 */
export function validateBackend(backendId, backend) {
  // Create minimal registry for validation
  const testRegistry = {
    version: '2.0',
    backends: {
      [backendId]: backend
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  try {
    validateRegistry(testRegistry);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: error.validationErrors || error.semanticErrors || [
        { message: error.message }
      ]
    };
  }
}

export default {
  validateRegistry,
  validateRegistryFile,
  validateBackend
};
