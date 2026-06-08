/**
 * Type declarations for packages that don't have @types
 */

declare module 'ipaddr.js' {
  export interface IPv4 {
    kind(): 'ipv4';
    match(other: IPv4 | IPv6, bits: number): boolean;
    toString(): string;
  }

  export interface IPv6 {
    kind(): 'ipv6';
    match(other: IPv4 | IPv6, bits: number): boolean;
    isIPv4MappedAddress(): boolean;
    toIPv4Address(): IPv4;
    toString(): string;
  }

  export type IPAddress = IPv4 | IPv6;

  export function parse(ip: string): IPAddress;
  export function parseCIDR(cidr: string): [IPAddress, number];
  export function isValid(ip: string): boolean;
}

declare module 'node-machine-id' {
  export interface MachineIdOptions {
    original?: boolean;
  }

  export function machineIdSync(options?: MachineIdOptions): string;
  export function machineId(options?: MachineIdOptions): Promise<string>;
}

declare module 'keytar' {
  export function setPassword(service: string, account: string, password: string): Promise<void>;
  export function getPassword(service: string, account: string): Promise<string | null>;
  export function deletePassword(service: string, account: string): Promise<boolean>;
  export function findPassword(service: string): Promise<string | null>;
  export function findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

declare module 'dockerode' {
  import { Readable } from 'stream';

  export interface ContainerCreateOptions {
    Image: string;
    name?: string;
    Env?: string[];
    Cmd?: string[];
    Volumes?: Record<string, unknown>;
    HostConfig?: {
      Binds?: string[];
      PortBindings?: Record<string, Array<{ HostPort: string }>>;
      RestartPolicy?: { Name: string; MaximumRetryCount?: number };
      NetworkMode?: string;
    };
    ExposedPorts?: Record<string, unknown>;
    Labels?: Record<string, string>;
  }

  export interface ContainerInspectInfo {
    Id: string;
    Created: string;
    Path: string;
    Args: string[];
    State: {
      Status: string;
      Running: boolean;
      Paused: boolean;
      Restarting: boolean;
      OOMKilled: boolean;
      Dead: boolean;
      Pid: number;
      ExitCode: number;
      Error: string;
      StartedAt: string;
      FinishedAt: string;
    };
    Image: string;
    Name: string;
    Config: {
      Hostname: string;
      Env: string[];
      Image: string;
    };
    NetworkSettings: {
      Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    };
  }

  export interface ExecCreateOptions {
    AttachStdin?: boolean;
    AttachStdout?: boolean;
    AttachStderr?: boolean;
    Tty?: boolean;
    Cmd?: string[];
  }

  export interface Container {
    id: string;
    start(): Promise<void>;
    stop(options?: { t?: number }): Promise<void>;
    remove(options?: { force?: boolean; v?: boolean }): Promise<void>;
    inspect(): Promise<ContainerInspectInfo>;
    logs(options?: {
      stdout?: boolean;
      stderr?: boolean;
      follow?: boolean;
      tail?: number;
    }): Promise<Readable>;
    attach(options?: {
      stream?: boolean;
      stdin?: boolean;
      stdout?: boolean;
      stderr?: boolean;
    }): Promise<Readable>;
    exec(options: ExecCreateOptions): Promise<Exec>;
  }

  export interface Exec {
    start(options?: { Detach?: boolean; Tty?: boolean }): Promise<Readable>;
  }

  export interface ImageBuildContext {
    context: string;
    src: string[];
  }

  export interface Image {
    remove(options?: { force?: boolean }): Promise<void>;
  }

  export default class Docker {
    constructor(options?: { socketPath?: string; host?: string; port?: number });
    createContainer(options: ContainerCreateOptions): Promise<Container>;
    getContainer(id: string): Container;
    listContainers(options?: { all?: boolean; filters?: Record<string, string[]> }): Promise<
      Array<{
        Id: string;
        Names: string[];
        Image: string;
        State: string;
        Status: string;
      }>
    >;
    pull(
      image: string,
      options?: { authconfig?: unknown }
    ): Promise<Readable>;
    buildImage(
      file: string | Readable | ImageBuildContext,
      options?: {
        t?: string;
        dockerfile?: string;
        buildargs?: Record<string, string>;
        pull?: boolean;
      }
    ): Promise<Readable>;
    getImage(name: string): Image;
    modem: {
      followProgress(
        stream: Readable,
        onFinished: (err: Error | null, output: unknown[]) => void,
        onProgress?: (event: unknown) => void
      ): void;
    };
  }
}
