/**
 * MCP Gateway Registry Validator
 *
 * Validates registry.json against the JSON Schema and applies a few
 * semantic checks the schema can't express on its own.
 */

import Ajv, { ErrorObject, AnySchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Registry, Server } from '../types/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  strictSchema: false,
});
addFormats(ajv);

let registrySchema: AnySchemaObject;
try {
  const schemaPath = path.resolve(__dirname, '../../../schema/registry-v2.schema.json');
  const schemaContent = await fs.readFile(schemaPath, 'utf-8');
  registrySchema = JSON.parse(schemaContent) as AnySchemaObject;
} catch (error) {
  const err = error as Error;
  throw new Error(`Failed to load registry schema: ${err.message}`);
}

const validate = ajv.compile(registrySchema);

interface ValidationError {
  location: string;
  message: string;
  suggestion?: string;
  value?: unknown;
}

interface SemanticIssue {
  server: string;
  message: string;
  suggestion?: string;
}

function formatValidationErrors(errors: ErrorObject[]): ValidationError[] {
  const formatted: ValidationError[] = [];
  const seen = new Set<string>();

  for (const error of errors) {
    const instancePath = error.instancePath ?? '/';
    const location = instancePath.replace(/^\//, '').replace(/\//g, '.');

    if (error.keyword === 'const' && error.parentSchema?.const) {
      continue;
    }

    let message = '';
    let suggestion = '';

    switch (error.keyword) {
      case 'required':
        message = `Missing required field: ${(error.params as { missingProperty: string }).missingProperty}`;
        suggestion = `Add "${(error.params as { missingProperty: string }).missingProperty}" to ${location || 'root'}`;
        break;
      case 'enum':
        message = `Invalid value: "${error.data}". Must be one of: ${(error.params as { allowedValues: string[] }).allowedValues.join(', ')}`;
        break;
      case 'pattern':
        message = `Value "${error.data}" does not match required pattern`;
        if (location.includes('repo')) {
          suggestion = 'Use https://...git or git@...git';
        } else if (location.includes('image')) {
          suggestion = 'Use lowercase image name, e.g. ghcr.io/user/img';
        }
        break;
      case 'type':
        message = `Invalid type: expected ${(error.params as { type: string }).type}`;
        break;
      case 'oneOf':
        message = `Configuration does not match exactly one expected variant at ${location || 'root'}`;
        suggestion = 'Check the "source" field and the required source-specific fields';
        break;
      case 'additionalProperties':
        message = `Unknown property: "${(error.params as { additionalProperty: string }).additionalProperty}"`;
        suggestion = 'Remove this property or check for typos';
        break;
      case 'format':
        message = `Invalid format: ${(error.params as { format: string }).format} for value "${error.data}"`;
        break;
      default:
        message = error.message ?? 'Validation failed';
    }

    const key = `${location}:${message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    formatted.push({ location: location || 'root', message, suggestion, value: error.data });
  }

  return formatted;
}

function printValidationErrors(errors: ValidationError[]): void {
  console.error('\nRegistry validation failed:\n');
  for (const e of errors) {
    console.error(`  ${e.location}: ${e.message}`);
    if (e.suggestion !== undefined) {
      console.error(`    -> ${e.suggestion}`);
    }
    if (e.value !== undefined && e.value !== null) {
      const valueStr = typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value);
      if (valueStr.length < 100) {
        console.error(`    current: ${valueStr}`);
      }
    }

    console.error('');
  }
}

function validateSemantics(registry: Registry): {
  warnings: SemanticIssue[];
  errors: SemanticIssue[];
} {
  const errors: SemanticIssue[] = [];
  const warnings: SemanticIssue[] = [];

  for (const [name, server] of Object.entries(registry.servers)) {
    // git: at most one of branch/tag/commit
    if (server.source === 'git') {
      const refs = ['branch', 'tag', 'commit'].filter(
        (k) => server[k as keyof typeof server] !== undefined
      );
      if (refs.length > 1) {
        errors.push({
          server: name,
          message: `git server has multiple state refs: ${refs.join(', ')}`,
          suggestion: 'Use at most one of branch, tag, commit',
        });
      }
    }

    // container: exactly one of image or build
    if (server.source === 'container') {
      const has = ['image', 'build'].filter((k) => server[k as keyof typeof server] !== undefined);
      if (has.length !== 1) {
        errors.push({
          server: name,
          message: `container server must have exactly one of: image, build (found: ${has.join(', ') || 'none'})`,
        });
      }
    }

    // container: volume format
    if (server.source === 'container' && server.volumes !== undefined) {
      for (const v of server.volumes) {
        if (!v.includes(':')) {
          errors.push({
            server: name,
            message: `Invalid volume format: "${v}"`,
            suggestion: 'Use host:container[:ro|rw]',
          });
        }
      }
    }

    // remote: transport required
    if (server.source === 'remote' && server.transport === undefined) {
      errors.push({
        server: name,
        message: 'remote server is missing required "transport" field',
      });
    }
  }

  // Gateway: API keys are now auto-generated and stored securely.
  // No validation needed here — apikey.ts handles generation/storage.
  // enableAuth defaults to true (secure by default) if not specified.

  return { warnings, errors };
}

export interface ValidationResult {
  valid: boolean;
  warnings?: SemanticIssue[];
  errors?: ValidationError[] | SemanticIssue[];
}

export function validateRegistry(registry: Registry): ValidationResult {
  const valid = validate(registry);
  if (!valid) {
    if (validate.errors === null || validate.errors === undefined) {
      throw new Error('Validation failed but no errors were reported');
    }
    const formatted = formatValidationErrors(validate.errors);
    printValidationErrors(formatted);
    const error = new Error('Registry validation failed') as Error & {
      validationErrors: ValidationError[];
    };
    error.validationErrors = formatted;
    throw error;
  }

  const { warnings, errors } = validateSemantics(registry);
  if (errors.length > 0) {
    console.error('\nRegistry semantic validation failed:\n');
    for (const e of errors) {
      console.error(`  Server "${e.server}": ${e.message}`);
      if (e.suggestion !== undefined) {
        console.error(`    -> ${e.suggestion}`);
      }
    }
    const err = new Error('Registry semantic validation failed') as Error & {
      semanticErrors: SemanticIssue[];
    };
    err.semanticErrors = errors;
    throw err;
  }

  if (warnings.length > 0) {
    console.warn('\nRegistry validation warnings:\n');
    for (const w of warnings) {
      console.warn(`  Server "${w.server}": ${w.message}`);
      if (w.suggestion !== undefined) {
        console.warn(`    -> ${w.suggestion}`);
      }
    }
  }

  return { valid: true, warnings };
}

export async function validateRegistryFile(filePath: string): Promise<ValidationResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const registry = JSON.parse(content) as Registry;
    return validateRegistry(registry);
  } catch (error) {
    const err = error as Error & {
      validationErrors?: ValidationError[];
      semanticErrors?: SemanticIssue[];
      parseError?: SyntaxError;
    };
    if (err.validationErrors !== undefined || err.semanticErrors !== undefined) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      console.error(`\nRegistry JSON parsing failed: ${error.message}\n`);
      const parseError = new Error('Invalid JSON syntax') as Error & {
        parseError: SyntaxError;
      };
      parseError.parseError = error;
      throw parseError;
    }
    throw new Error(`Failed to read registry file: ${err.message}`);
  }
}

/**
 * Validate a single server entry (used by UI for inline checks).
 */
export function validateServer(
  serverName: string,
  server: Server
): { valid: boolean; errors: Array<{ message: string }> } {
  const testRegistry: Registry = {
    version: '2.0',
    servers: { [serverName]: server },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] },
    },
  };
  try {
    validateRegistry(testRegistry);
    return { valid: true, errors: [] };
  } catch (error) {
    const err = error as Error & {
      validationErrors?: ValidationError[];
      semanticErrors?: SemanticIssue[];
    };
    return {
      valid: false,
      errors: err.validationErrors ?? err.semanticErrors ?? [{ message: (error as Error).message }],
    };
  }
}

export default { validateRegistry, validateRegistryFile, validateServer };
