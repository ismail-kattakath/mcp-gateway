import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const AUTH_CONFIG_FILENAME = ".mcp-gateway.json";

export interface AuthConfig {
  disableAuth?: boolean;
  allowedIPs?: string[];
}

export function getAuthConfigPath(registryPath: string): string {
  // Auth config is in same directory as registry.json
  return resolve(dirname(registryPath), AUTH_CONFIG_FILENAME);
}

export function loadAuthConfig(registryPath: string): AuthConfig {
  const configPath = getAuthConfigPath(registryPath);
  if (!existsSync(configPath)) {
    return { disableAuth: false, allowedIPs: [] };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as AuthConfig;
  } catch {
    return { disableAuth: false, allowedIPs: [] };
  }
}

export function saveAuthConfig(config: AuthConfig, registryPath: string): void {
  const configPath = getAuthConfigPath(registryPath);
  const cleaned: AuthConfig = { disableAuth: config.disableAuth ?? false };
  if (config.allowedIPs && config.allowedIPs.length > 0) {
    cleaned.allowedIPs = config.allowedIPs;
  }
  writeFileSync(configPath, JSON.stringify(cleaned, null, 2) + "\n");
}
