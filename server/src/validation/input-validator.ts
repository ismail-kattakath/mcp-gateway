/**
 * Input Validation Module
 *
 * Centralized validation for all user inputs to prevent injection attacks:
 * - Server names, URLs, paths, command arguments
 * - JSON payloads against schemas
 * - Prevents: SQL injection, command injection, XSS, path traversal, LDAP injection
 *
 * All validators throw ValidationError on failure.
 */

import Ajv, { AnySchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import path from 'path';
import {
  sanitizeString,
  sanitizeServerName,
  sanitizeUrl,
  sanitizePath,
} from '../logging/sanitizer.js';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Input validator with AJV schema validation and security-focused checks
 */
export class InputValidator {
  private ajv: Ajv;
  private schemas: Map<string, ReturnType<Ajv['compile']>> = new Map();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      coerceTypes: false,
      strict: false,
      strictSchema: false,
    });
    addFormats(this.ajv);
  }

  /**
   * Register a JSON schema for validation
   */
  registerSchema(name: string, schema: AnySchemaObject): void {
    const validator = this.ajv.compile(schema);
    this.schemas.set(name, validator);
  }

  /**
   * Validate data against a registered schema
   */
  validateJson(data: unknown, schemaName: string): void {
    const validator = this.schemas.get(schemaName);
    if (!validator) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    const valid = validator(data);
    if (!valid) {
      const errors = validator.errors
        ?.map((e) => `${e.instancePath || 'root'}: ${e.message}`)
        .join('; ');
      throw new ValidationError(`JSON validation failed: ${errors}`, schemaName, data);
    }
  }

  /**
   * Validate server name: lowercase alphanumeric + hyphens, 1-64 chars
   */
  validateServerName(name: unknown): string {
    if (typeof name !== 'string') {
      throw new ValidationError('Server name must be a string', 'serverName', name);
    }

    // Sanitize first to remove dangerous characters
    const sanitized = sanitizeServerName(name);

    // Check if sanitization resulted in invalid marker
    if (sanitized === '[INVALID_SERVER_NAME]') {
      throw new ValidationError(
        'Invalid server name: must be lowercase alphanumeric with hyphens, 1-64 chars',
        'serverName',
        name
      );
    }

    // Additional validation: must match strict pattern
    if (!/^[a-z0-9-]{1,64}$/.test(sanitized)) {
      throw new ValidationError(
        'Invalid server name format: must be lowercase alphanumeric with hyphens',
        'serverName',
        name
      );
    }

    // Cannot start or end with hyphen
    if (sanitized.startsWith('-') || sanitized.endsWith('-')) {
      throw new ValidationError(
        'Invalid server name: cannot start or end with hyphen',
        'serverName',
        name
      );
    }

    return sanitized;
  }

  /**
   * Validate URL: http/https only, no dangerous protocols
   */
  validateUrl(urlString: unknown): string {
    if (typeof urlString !== 'string') {
      throw new ValidationError('URL must be a string', 'url', urlString);
    }

    // Sanitize first
    const sanitized = sanitizeUrl(urlString);

    if (sanitized === '[INVALID_URL]') {
      throw new ValidationError('Invalid URL format', 'url', urlString);
    }

    try {
      const parsed = new URL(urlString); // Parse original, not sanitized (which removed query params)

      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ValidationError(
          `Invalid URL protocol: ${parsed.protocol}. Only http: and https: are allowed`,
          'url',
          urlString
        );
      }

      // Block localhost/loopback in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = parsed.hostname.toLowerCase();
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' ||
          hostname.startsWith('127.') ||
          hostname === '0.0.0.0'
        ) {
          throw new ValidationError('Localhost URLs not allowed in production', 'url', urlString);
        }
      }

      return sanitized;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Invalid URL format', 'url', urlString);
    }
  }

  /**
   * Validate path: prevent path traversal attacks
   */
  validatePath(inputPath: unknown, allowedParent?: string): string {
    if (typeof inputPath !== 'string') {
      throw new ValidationError('Path must be a string', 'path', inputPath);
    }

    // Sanitize first
    const sanitized = sanitizePath(inputPath);

    if (sanitized === '[INVALID_PATH]') {
      throw new ValidationError('Invalid path format', 'path', inputPath);
    }

    // Resolve to absolute path
    const resolved = path.resolve(inputPath);

    // Check for null bytes (path traversal attempt)
    if (inputPath.includes('\0')) {
      throw new ValidationError('Path contains null bytes', 'path', inputPath);
    }

    // Check for path traversal patterns
    const dangerous = ['../', '..\\', '%2e%2e', '%252e%252e'];
    for (const pattern of dangerous) {
      if (inputPath.toLowerCase().includes(pattern)) {
        throw new ValidationError('Path contains traversal pattern', 'path', inputPath);
      }
    }

    // If allowedParent specified, ensure path is within it
    if (allowedParent) {
      const allowedResolved = path.resolve(allowedParent);
      if (!resolved.startsWith(allowedResolved)) {
        throw new ValidationError(`Path must be within ${allowedParent}`, 'path', inputPath);
      }
    }

    return sanitized;
  }

  /**
   * Validate command arguments: prevent command injection
   */
  validateArgs(args: unknown): string[] {
    if (!Array.isArray(args)) {
      throw new ValidationError('Args must be an array', 'args', args);
    }

    const validated: string[] = [];

    for (const arg of args) {
      if (typeof arg !== 'string') {
        throw new ValidationError('Each arg must be a string', 'args', arg);
      }

      // Check for command injection patterns
      const dangerous = ['&&', '||', ';', '|', '`', '$', '>', '<', '\n', '\r'];
      for (const pattern of dangerous) {
        if (arg.includes(pattern)) {
          throw new ValidationError(
            `Argument contains dangerous character: ${pattern}`,
            'args',
            arg
          );
        }
      }

      // Sanitize and add
      validated.push(sanitizeString(arg, 200));
    }

    return validated;
  }

  /**
   * Validate environment variable name
   */
  validateEnvKey(key: unknown): string {
    if (typeof key !== 'string') {
      throw new ValidationError('Environment variable name must be a string', 'envKey', key);
    }

    // Env keys must be uppercase alphanumeric + underscore
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new ValidationError(
        'Invalid env key format: must be uppercase alphanumeric with underscores',
        'envKey',
        key
      );
    }

    if (key.length > 128) {
      throw new ValidationError(
        'Environment variable name too long (max 128 chars)',
        'envKey',
        key
      );
    }

    return key;
  }

  /**
   * Validate environment variable value
   */
  validateEnvValue(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError('Environment variable value must be a string', 'envValue', value);
    }

    // Check for null bytes
    if (value.includes('\0')) {
      throw new ValidationError('Environment variable contains null bytes', 'envValue', value);
    }

    if (value.length > 4096) {
      throw new ValidationError(
        'Environment variable value too long (max 4096 chars)',
        'envValue',
        value
      );
    }

    return value;
  }

  /**
   * Validate LDAP filter: prevent LDAP injection
   */
  validateLdapFilter(filter: unknown): string {
    if (typeof filter !== 'string') {
      throw new ValidationError('LDAP filter must be a string', 'ldapFilter', filter);
    }

    // LDAP special characters that must be escaped: ( ) \ * NUL
    const dangerous = ['(', ')', '\\', '*', '\0'];
    for (const char of dangerous) {
      if (filter.includes(char)) {
        throw new ValidationError(
          `LDAP filter contains unescaped special character: ${char}`,
          'ldapFilter',
          filter
        );
      }
    }

    return filter;
  }

  /**
   * Validate SQL identifier (table/column name): prevent SQL injection
   */
  validateSqlIdentifier(identifier: unknown): string {
    if (typeof identifier !== 'string') {
      throw new ValidationError('SQL identifier must be a string', 'sqlIdentifier', identifier);
    }

    // SQL identifiers: alphanumeric + underscore, starting with letter
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new ValidationError(
        'Invalid SQL identifier: must start with letter, contain only alphanumeric and underscore',
        'sqlIdentifier',
        identifier
      );
    }

    if (identifier.length > 64) {
      throw new ValidationError(
        'SQL identifier too long (max 64 chars)',
        'sqlIdentifier',
        identifier
      );
    }

    return identifier;
  }

  /**
   * Validate port number
   */
  validatePort(port: unknown): number {
    if (typeof port === 'string') {
      port = parseInt(port, 10);
    }

    if (typeof port !== 'number' || isNaN(port)) {
      throw new ValidationError('Port must be a number', 'port', port);
    }

    if (port < 1 || port > 65535) {
      throw new ValidationError('Port must be between 1 and 65535', 'port', port);
    }

    return port;
  }

  /**
   * Validate IP address (v4 or v6)
   */
  validateIpAddress(ip: unknown): string {
    if (typeof ip !== 'string') {
      throw new ValidationError('IP address must be a string', 'ip', ip);
    }

    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

    if (!ipv4Pattern.test(ip) && !ipv6Pattern.test(ip)) {
      throw new ValidationError('Invalid IP address format', 'ip', ip);
    }

    // Validate IPv4 octets
    if (ipv4Pattern.test(ip)) {
      const octets = ip.split('.').map(Number);
      if (octets.some((octet) => octet > 255)) {
        throw new ValidationError('Invalid IPv4 address: octet out of range', 'ip', ip);
      }
    }

    return ip;
  }

  /**
   * Validate email address
   */
  validateEmail(email: unknown): string {
    if (typeof email !== 'string') {
      throw new ValidationError('Email must be a string', 'email', email);
    }

    // Basic email pattern (not RFC-compliant, but good enough for security)
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailPattern.test(email)) {
      throw new ValidationError('Invalid email format', 'email', email);
    }

    if (email.length > 254) {
      throw new ValidationError('Email too long (max 254 chars)', 'email', email);
    }

    return email;
  }

  /**
   * Validate Docker image name
   */
  validateDockerImage(image: unknown): string {
    if (typeof image !== 'string') {
      throw new ValidationError('Docker image must be a string', 'dockerImage', image);
    }

    // Docker image: [registry/][namespace/]name[:tag|@digest]
    // Must be lowercase, alphanumeric + hyphens/underscores/dots/colons
    const pattern = /^[a-z0-9][a-z0-9._\/-]*(?::[a-z0-9._-]+|@sha256:[a-f0-9]{64})?$/;

    if (!pattern.test(image)) {
      throw new ValidationError(
        'Invalid Docker image format: must be lowercase alphanumeric with allowed separators',
        'dockerImage',
        image
      );
    }

    if (image.length > 255) {
      throw new ValidationError('Docker image name too long (max 255 chars)', 'dockerImage', image);
    }

    return image;
  }

  /**
   * Validate Git repository URL
   */
  validateGitRepo(repo: unknown): string {
    if (typeof repo !== 'string') {
      throw new ValidationError('Git repository must be a string', 'gitRepo', repo);
    }

    // Allow https:// or git@ URLs
    const httpsPattern = /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._/-]+\.git$/;
    const sshPattern = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+\.git$/;

    if (!httpsPattern.test(repo) && !sshPattern.test(repo)) {
      throw new ValidationError(
        'Invalid Git repository URL: must be https://...git or git@...git',
        'gitRepo',
        repo
      );
    }

    return repo;
  }
}

/**
 * Singleton instance for global use
 */
export const inputValidator = new InputValidator();

export default inputValidator;
