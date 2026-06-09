/**
 * API Client utilities for audit commands.
 *
 * Provides axios-based HTTP client for audit commands that need to resolve
 * auth config from registry path directory.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";

const AUTH_CONFIG_FILENAME = ".mcp-gateway.json";

interface AuthConfig {
  disableAuth?: boolean;
  apiKey?: string;
}

/**
 * Create an API client instance with registry path context.
 * This is used by audit commands that need to resolve auth config from registry path.
 *
 * @param registryPath - Path to registry.json (used to find .mcp-gateway.json in same directory)
 * @returns Configured axios instance with authentication
 */
export async function getApiClient(registryPath: string): Promise<AxiosInstance> {
  const baseUrl = process.env.MCP_GATEWAY_URL || "http://localhost:3000";

  // Load API key from .mcp-gateway.json in same directory as registry
  let apiKey: string | undefined = process.env.MCP_GATEWAY_API_KEY;

  if (!apiKey) {
    const configPath = resolve(dirname(registryPath), AUTH_CONFIG_FILENAME);
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8")) as AuthConfig;
        apiKey = config.apiKey;
      } catch {
        // Ignore parse errors
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
    headers,
  });

  // Add error interceptor for consistent error handling
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data as { error?: string; message?: string };

        if (status === 401) {
          throw new Error(
            "Authentication failed. Set MCP_GATEWAY_API_KEY or use --no-auth flag."
          );
        }
        if (status === 403) {
          throw new Error("Access denied. Check your IP allowlist configuration.");
        }
        if (status === 404) {
          throw new Error(data?.error || "Resource not found");
        }
        if (status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }

        throw new Error(data?.error || data?.message || `HTTP ${status} error`);
      }

      if (error.code === "ECONNREFUSED") {
        throw new Error("Cannot connect to gateway. Is it running?");
      }
      if (error.code === "ETIMEDOUT") {
        throw new Error("Request timed out. Check your network connection.");
      }

      throw new Error(error.message || "Unknown error occurred");
    }
  );

  return client;
}
