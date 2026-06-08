/**
 * MCP Gateway Registry Type Definitions
 * Mirrors schema/registry-v2.schema.json
 */

export type Lifecycle = 'on-demand' | 'persistent';

export type Source = 'pkg' | 'git' | 'container' | 'remote' | 'local';

export interface BaseServer {
  /** Optional. Default: 'on-demand'. Applied by the loader. */
  lifecycle?: Lifecycle;
  /** Optional. Default: true. Applied by the loader. */
  enabled?: boolean;
  /** Optional. Default: 30000 (ms). Range 1000–300000. */
  timeout?: number;
}

export interface PkgServer extends BaseServer {
  source: 'pkg';
  /** Package manager binary, e.g. 'npx', 'uvx', 'pipx'. */
  command: string;
  /** Args including the package name. Version embedded inline: 'obs-mcp@1.2.3'. */
  args: string[];
  env?: Record<string, string>;
}

export interface GitServer extends BaseServer {
  source: 'git';
  /** Git URL (https or ssh, must end .git). */
  repo: string;
  /** At most one of branch/tag/commit. Default: remote HEAD. */
  branch?: string;
  tag?: string;
  commit?: string;
  /** Optional override for auto-detected install steps. */
  install?: string[];
  /** Optional override for auto-detected build steps. */
  build?: string[];
  /** Command to run the built artifact, e.g. 'node', 'python3'. */
  command: string;
  /** Args. Use ${REPO_DIR} to reference the clone location. */
  args: string[];
  env?: Record<string, string>;
}

export interface ContainerBuild {
  /** Optional. If present, clone first then build. */
  repo?: string;
  /** Path to Dockerfile, relative to context. Default: 'Dockerfile'. */
  dockerfile?: string;
  /** Build context. Default: '.'. */
  context?: string;
  /** docker --build-arg key=value pairs. */
  args?: Record<string, string>;
}

export interface ContainerServer extends BaseServer {
  source: 'container';
  /** Exactly one of image or build. */
  image?: string;
  build?: ContainerBuild;
  /** When to pull (only meaningful with `image`). Default: 'missing'. */
  pull?: 'always' | 'missing' | 'never';
  volumes?: string[];
  /** containerPort -> hostPort */
  ports?: Record<string, number>;
  env?: Record<string, string>;
}

export interface RemoteServer extends BaseServer {
  source: 'remote';
  transport: 'sse' | 'http';
  url: string;
  /** Only meaningful for HTTP transport. Default: 'POST'. */
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
}

export interface LocalServer extends BaseServer {
  source: 'local';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type Server = PkgServer | GitServer | ContainerServer | RemoteServer | LocalServer;

export interface ServerConfig {
  port: number;
  host: string;
  transport: 'sse' | 'http' | 'both';
  cors?: {
    enabled?: boolean;
    origins?: string[];
    credentials?: boolean;
  };
}

export interface StorageConfig {
  repos: string;
  cache: string;
  logs: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  outputs: ('console' | 'file')[];
}

export interface GatewayConfig {
  server: ServerConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  /** Require Bearer token for SSE/HTTP access. stdio bypasses auth. Default: true. */
  enableAuth?: boolean;
  /** CIDR-aware IP allowlist. Empty = no IP filtering. */
  allowedIPs?: string[];
}

export interface Registry {
  version: '2.0';
  /** Server entries keyed by server name (lowercase, hyphens allowed). */
  servers: Record<string, Server>;
  gateway: GatewayConfig;
}

/** Narrow a Server to a specific source variant. */
export function isSource<T extends Source>(
  server: Server,
  source: T
): server is Extract<Server, { source: T }>;
