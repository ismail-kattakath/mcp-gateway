import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

/**
 * Authentication configuration schema
 * Stored in .mcp-gateway.json (user home or project root)
 */
export interface AuthConfig {
  /** Disable authentication (INSECURE). Default: false (auth enabled). */
  disableAuth?: boolean;
  /** CIDR-aware IP allowlist. Empty = no IP filtering. */
  allowedIPs?: string[];
}

const CONFIG_FILENAME = '.mcp-gateway.json';

/**
 * Get the auth config file path
 * Priority:
 * 1. Project root (same dir as registry.json)
 * 2. User home directory
 */
export function getAuthConfigPath(registryPath?: string): string {
  // If registry path provided, use its directory
  if (registryPath && existsSync(registryPath)) {
    const projectRoot = dirname(registryPath);
    return resolve(projectRoot, CONFIG_FILENAME);
  }

  // Otherwise use home directory
  return resolve(homedir(), CONFIG_FILENAME);
}

/**
 * Load auth config from disk
 * Returns empty config if file doesn't exist
 */
export function loadAuthConfig(registryPath?: string): AuthConfig {
  const configPath = getAuthConfigPath(registryPath);

  if (!existsSync(configPath)) {
    // Return secure defaults
    return {
      disableAuth: false,
      allowedIPs: [],
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as AuthConfig;

    // Apply defaults
    return {
      disableAuth: config.disableAuth ?? false,
      allowedIPs: config.allowedIPs ?? [],
    };
  } catch (error) {
    console.error(`Failed to load auth config from ${configPath}:`, error);
    // Return secure defaults on error
    return {
      disableAuth: false,
      allowedIPs: [],
    };
  }
}

/**
 * Save auth config to disk
 */
export function saveAuthConfig(config: AuthConfig, registryPath?: string): void {
  const configPath = getAuthConfigPath(registryPath);

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Clean up empty arrays
  const cleanedConfig: AuthConfig = {
    disableAuth: config.disableAuth ?? false,
  };

  if (config.allowedIPs && config.allowedIPs.length > 0) {
    cleanedConfig.allowedIPs = config.allowedIPs;
  }

  writeFileSync(configPath, JSON.stringify(cleanedConfig, null, 2) + '\n', 'utf-8');
}

/**
 * Update specific auth config fields
 */
export function updateAuthConfig(
  updates: Partial<AuthConfig>,
  registryPath?: string
): void {
  const current = loadAuthConfig(registryPath);
  const merged = {
    ...current,
    ...updates,
  };
  saveAuthConfig(merged, registryPath);
}

/**
 * Check if auth is disabled
 * Checks env var first, then config file
 */
export function isAuthDisabled(registryPath?: string): boolean {
  // Environment variable takes precedence
  const envDisabled = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
  if (envDisabled !== undefined) {
    return envDisabled === 'true';
  }

  // Fall back to config file
  const config = loadAuthConfig(registryPath);
  return config.disableAuth ?? false;
}

/**
 * Get allowed IPs from config
 */
export function getAllowedIPs(registryPath?: string): string[] {
  const config = loadAuthConfig(registryPath);
  return config.allowedIPs ?? [];
}
