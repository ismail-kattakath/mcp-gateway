/**
 * MCP Gateway Registry Type Definitions
 * Auto-generated from registry-v2.schema.json
 */

export type Lifecycle = 'on-demand' | 'persistent';

export type BackendType =
  | 'npx'
  | 'uvx'
  | 'pipx'
  | 'docker'
  | 'git-npm'
  | 'git-python'
  | 'git-docker'
  | 'local'
  | 'remote-sse'
  | 'remote-http'
  | 'shell';

export interface BaseBackend {
  name: string;
  description: string;
  type: BackendType;
  lifecycle: Lifecycle;
  timeout?: number;
  enabled: boolean;
}

export interface NpxBackend extends BaseBackend {
  type: 'npx';
  install: {
    package: string;
    version?: string;
  };
  runtime?: {
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface UvxBackend extends BaseBackend {
  type: 'uvx';
  install: {
    package: string;
    version?: string;
  };
  runtime?: {
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface PipxBackend extends BaseBackend {
  type: 'pipx';
  install: {
    package: string;
    version?: string;
  };
  runtime?: {
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface DockerBackend extends BaseBackend {
  type: 'docker';
  install: {
    image: string;
    tag?: string;
    pull?: 'always' | 'missing' | 'never';
  };
  runtime?: {
    volumes?: string[];
    ports?: Record<string, number>;
    env?: Record<string, string>;
    network?: string;
  };
  healthcheck?: {
    endpoint: string;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  auth?: OAuthAuth;
}

export interface GitBuildConfig {
  steps: string[];
  entrypoint: string;
}

export interface GitNpmBackend extends BaseBackend {
  type: 'git-npm';
  install: {
    repository: string;
    branch?: string;
    commit?: string;
    build: GitBuildConfig;
  };
  runtime: {
    command: 'node' | 'bun' | 'deno';
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface GitPythonBackend extends BaseBackend {
  type: 'git-python';
  install: {
    repository: string;
    branch?: string;
    commit?: string;
    build: GitBuildConfig;
  };
  runtime: {
    command: 'python' | 'python3' | 'uv';
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface GitDockerBuildConfig {
  dockerfile?: string;
  context?: string;
  args?: Record<string, string>;
}

export interface GitDockerBackend extends BaseBackend {
  type: 'git-docker';
  install: {
    repository: string;
    branch?: string;
    commit?: string;
    build: GitDockerBuildConfig;
  };
  runtime?: {
    volumes?: string[];
    ports?: Record<string, number>;
    env?: Record<string, string>;
  };
  healthcheck?: {
    endpoint: string;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  auth?: OAuthAuth;
}

export interface LocalBackend extends BaseBackend {
  type: 'local';
  install: {
    path: string;
  };
  runtime: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export interface RemoteSSEBackend extends BaseBackend {
  type: 'remote-sse';
  install: {
    url: string;
  };
  runtime?: {
    headers?: Record<string, string>;
    timeout?: number;
  };
  auth?: OAuthAuth;
}

export interface RemoteHTTPBackend extends BaseBackend {
  type: 'remote-http';
  install: {
    url: string;
  };
  runtime?: {
    headers?: Record<string, string>;
    method?: 'GET' | 'POST';
    timeout?: number;
  };
  auth?: OAuthAuth;
}

export interface ShellBackend extends BaseBackend {
  type: 'shell';
  install: {
    script: string;
  };
  runtime?: {
    shell?: 'bash' | 'zsh' | 'sh';
    args?: string[];
    env?: Record<string, string>;
  };
  auth?: OAuthAuth;
}

export type Backend =
  | NpxBackend
  | UvxBackend
  | PipxBackend
  | DockerBackend
  | GitNpmBackend
  | GitPythonBackend
  | GitDockerBackend
  | LocalBackend
  | RemoteSSEBackend
  | RemoteHTTPBackend
  | ShellBackend;

export interface OAuthAuth {
  type: 'oauth';
  provider: 'github' | 'smithery';
  scopes?: string[];
  tokenRefresh?: boolean;
}

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

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface OAuthConfig {
  providers?: {
    github?: OAuthProviderConfig;
    smithery?: OAuthProviderConfig;
  };
}

export interface SecurityConfig {
  apiKey?: string;
  enableAuth?: boolean;
  allowedIPs?: string[];
}

export interface GatewayConfig {
  server: ServerConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  oauth?: OAuthConfig;
  security?: SecurityConfig;
}

export interface Registry {
  version: '2.0';
  backends: Record<string, Backend>;
  gateway: GatewayConfig;
}

/**
 * Type guard to check if a backend is of a specific type
 */
export function isBackendType<T extends Backend['type']>(
  backend: Backend,
  type: T
): backend is Extract<Backend, { type: T }> {
  return backend.type === type;
}

/**
 * Type guard to check if a backend requires OAuth
 */
export function hasOAuth(backend: Backend): backend is Backend & { auth: OAuthAuth } {
  return 'auth' in backend && backend.auth?.type === 'oauth';
}

/**
 * Type guard to check if a backend has git installation
 */
export function isGitBackend(
  backend: Backend
): backend is GitNpmBackend | GitPythonBackend | GitDockerBackend {
  return backend.type === 'git-npm' || backend.type === 'git-python' || backend.type === 'git-docker';
}

/**
 * Type guard to check if a backend uses Docker runtime
 */
export function isDockerRuntime(
  backend: Backend
): backend is DockerBackend | GitDockerBackend {
  return backend.type === 'docker' || backend.type === 'git-docker';
}

/**
 * Type guard to check if a backend is remote
 */
export function isRemoteBackend(
  backend: Backend
): backend is RemoteSSEBackend | RemoteHTTPBackend {
  return backend.type === 'remote-sse' || backend.type === 'remote-http';
}
