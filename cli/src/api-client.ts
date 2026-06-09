import * as keytar from "keytar";

const KEYCHAIN_SERVICE = "mcp-gateway";
const KEYCHAIN_ACCOUNT = "api-key";

export interface ApiClientOptions {
  baseUrl?: string;
  debug?: boolean;
  disableAuth?: boolean;
}

export interface ServerStatus {
  serverName: string;
  source: string;
  state: string;
  pid: number | null;
  uptime?: number;
  retryCount?: number;
  lastError?: string | null;
}

export interface ServerConfig {
  source: "pkg" | "git" | "container" | "remote" | "local";
  command?: string;
  args?: string[];
  enabled?: boolean;
  lifecycle?: "persistent" | "on-demand";
  timeout?: number;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  stream: string;
  message: string;
}

export class ApiClient {
  private baseUrl: string;
  private debug: boolean;
  private disableAuth: boolean;
  private apiKey: string | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || "http://localhost:3000";
    this.debug = options.debug || false;
    this.disableAuth = options.disableAuth || false;
  }

  private async getApiKey(): Promise<string | null> {
    if (this.apiKey) return this.apiKey;

    try {
      this.apiKey = await keytar.getPassword(
        KEYCHAIN_SERVICE,
        KEYCHAIN_ACCOUNT,
      );
      return this.apiKey;
    } catch (error) {
      if (this.debug) {
        console.error("Failed to retrieve API key from keychain:", error);
      }
      return null;
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication if not disabled
    if (!this.disableAuth) {
      const apiKey = await this.getApiKey();
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else if (this.debug) {
        console.warn("No API key found in keychain");
      }
    }

    if (this.debug) {
      console.error(`[DEBUG] ${options.method || "GET"} ${url}`);
      if (options.body) {
        console.error("[DEBUG] Body:", options.body);
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({ error: response.statusText }))) as { error?: string };
      throw new Error(
        error.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // Server management
  async listServers(): Promise<{
    servers: Record<string, ServerStatus>;
    count: number;
  }> {
    return this.request("/api/servers");
  }

  async getServer(
    name: string,
  ): Promise<{ name: string; config: ServerConfig; status: ServerStatus }> {
    return this.request(`/api/servers/${name}`);
  }

  async createServer(
    name: string,
    config: ServerConfig,
  ): Promise<{ success: boolean; name: string; status: ServerStatus }> {
    return this.request("/api/servers", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    });
  }

  async updateServer(
    name: string,
    config: ServerConfig,
  ): Promise<{
    success: boolean;
    name: string;
    restarted: boolean;
    status: ServerStatus;
  }> {
    return this.request(`/api/servers/${name}`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async deleteServer(
    name: string,
  ): Promise<{ success: boolean; name: string }> {
    return this.request(`/api/servers/${name}`, {
      method: "DELETE",
    });
  }

  // Server control
  async startServer(
    name: string,
  ): Promise<{ success: boolean; serverName: string; status: ServerStatus }> {
    return this.request(`/api/servers/${name}/start`, { method: "POST" });
  }

  async stopServer(
    name: string,
  ): Promise<{ success: boolean; serverName: string; status: ServerStatus }> {
    return this.request(`/api/servers/${name}/stop`, { method: "POST" });
  }

  async restartServer(
    name: string,
  ): Promise<{ success: boolean; serverName: string; status: ServerStatus }> {
    return this.request(`/api/servers/${name}/restart`, { method: "POST" });
  }

  async enableServer(
    name: string,
  ): Promise<{ success: boolean; serverName: string; enabled: boolean }> {
    return this.request(`/api/servers/${name}/enable`, { method: "POST" });
  }

  async disableServer(
    name: string,
  ): Promise<{ success: boolean; serverName: string; enabled: boolean }> {
    return this.request(`/api/servers/${name}/disable`, { method: "POST" });
  }

  // Logs
  async getLogs(
    serverName?: string,
    limit?: number,
  ): Promise<{
    serverName?: string;
    servers?: Record<string, LogEntry[]>;
    logs?: LogEntry[];
    count: number;
  }> {
    const query = limit ? `?limit=${limit}` : "";
    const path = serverName
      ? `/api/logs/${serverName}${query}`
      : `/api/logs${query}`;
    return this.request(path);
  }

  // Health
  async health(): Promise<{
    status: string;
    uptime: number;
    version: string;
    servers: {
      total: number;
      enabled: number;
      running: number;
      list: string[];
    };
  }> {
    return this.request("/health");
  }
}
