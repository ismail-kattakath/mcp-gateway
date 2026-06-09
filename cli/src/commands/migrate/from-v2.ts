/**
 * CLI command: mcp migrate from-v2
 * Migrates v2.x registry to v3.0 format
 */

import { Command, Flags } from "@oclif/core";
import fs from "fs/promises";
import path from "path";
import Ajv from "ajv";
import chalk from "chalk";

interface ServerConfig {
  source?: string;
  type?: string;
  [key: string]: unknown;
}

interface GatewayConfig {
  port?: number;
  host?: string;
  transport?: string;
  cors?: unknown;
  server?: unknown;
  storage?: unknown;
  logging?: unknown;
  disableAuth?: boolean;
  allowedIPs?: string[];
}

interface V2Registry {
  version?: string;
  mcpServers?: Record<string, ServerConfig>; // v2.0
  servers?: Record<string, ServerConfig>; // v2.1
  gateway?: GatewayConfig;
}

interface V3Registry {
  version: string;
  servers: Record<string, ServerConfig>;
}

interface AuthConfig {
  version: string;
  auth: {
    enabled: boolean;
    strategies: {
      apiKey: {
        enabled: boolean;
      };
    };
    ipAllowlist: string[];
  };
}

export default class MigrateFromV2 extends Command {
  static description = "Migrate v2.x registry to v3.0 format";

  static examples = [
    "<%= config.bin %> <%= command.id %> --registry registry.json",
    "<%= config.bin %> <%= command.id %> --registry v2-registry.json --output v3-registry.json",
    "<%= config.bin %> <%= command.id %> --registry registry.json --dry-run",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to v2 registry.json",
      required: true,
    }),
    output: Flags.string({
      char: "o",
      description: "Output path for v3 registry.json (default: same as input)",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description: "Show changes without writing files",
      default: false,
    }),
    backup: Flags.boolean({
      char: "b",
      description: "Create .v2.backup copies",
      default: true,
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateFromV2);

    try {
      // Read v2 registry
      const v2Path = path.resolve(flags.registry);
      this.log(chalk.blue("Reading v2 registry..."));
      const v2Content = await fs.readFile(v2Path, "utf-8");
      const v2Registry: V2Registry = JSON.parse(v2Content);

      // Detect version
      const version = this.detectVersion(v2Registry);
      this.log(chalk.green(`✓ Detected version: ${version}`));

      if (version === "3.0") {
        this.log(
          chalk.yellow(
            "⚠ Registry is already v3.0 format. No migration needed.",
          ),
        );
        return;
      }

      // Backup if requested
      if (flags.backup && !flags["dry-run"]) {
        const backupPath = `${v2Path}.v2.backup`;
        await fs.copyFile(v2Path, backupPath);
        this.log(chalk.green(`✓ Backup created: ${backupPath}`));
      }

      // Convert registry structure
      this.log(chalk.blue("Converting registry structure..."));
      const v3Registry = this.convertRegistry(v2Registry, version);

      // Extract auth config (if present in v2)
      const authConfig = this.extractAuthConfig(v2Registry);

      // Validate v3 registry
      this.log(chalk.blue("Validating v3 registry..."));
      this.validateV3Registry(v3Registry);
      this.log(chalk.green("✓ Validation passed"));

      if (flags["dry-run"]) {
        this.log(chalk.yellow("\n=== DRY RUN MODE ==="));
        this.log(chalk.yellow("No files will be written.\n"));
        this.log(chalk.bold("v3 registry.json:"));
        this.log(JSON.stringify(v3Registry, null, 2));
        if (authConfig) {
          this.log(chalk.bold("\n.mcp-gateway.json:"));
          this.log(JSON.stringify(authConfig, null, 2));
        }
        return;
      }

      // Write v3 registry
      const outputPath = flags.output ? path.resolve(flags.output) : v2Path;
      await fs.writeFile(outputPath, JSON.stringify(v3Registry, null, 2));
      this.log(chalk.green(`✓ Migrated registry written to: ${outputPath}`));

      // Write auth config (if present)
      if (authConfig) {
        const authPath = path.join(
          path.dirname(outputPath),
          ".mcp-gateway.json",
        );
        await fs.writeFile(authPath, JSON.stringify(authConfig, null, 2));
        this.log(chalk.green(`✓ Auth config written to: ${authPath}`));
      }

      this.log(chalk.green.bold("\n✓ Migration complete!"));
      this.log(chalk.gray("Next steps:"));
      this.log(chalk.gray("1. Review the migrated files"));
      this.log(chalk.gray("2. Run: mcp registry version"));
      this.log(chalk.gray("3. Test your configuration"));
    } catch (error) {
      const err = error as Error;
      this.error(chalk.red(`Migration failed: ${err.message}`));
    }
  }

  private detectVersion(registry: V2Registry): string {
    // Explicit version field takes precedence
    if (registry.version) return registry.version;

    // Heuristic detection based on structure
    if (registry.mcpServers) return "2.0";
    if (registry.servers) return "2.1";

    // Default to v2.1 if structure is unclear
    return "2.1";
  }

  private convertRegistry(v2: V2Registry, version: string): V3Registry {
    const v3: V3Registry = {
      version: "3.0",
      servers: {},
    };

    // v2.0 used "mcpServers", v2.1 used "servers"
    const servers = v2.mcpServers || v2.servers || {};

    for (const [name, config] of Object.entries(servers)) {
      // Map v2 config to v3 config
      // In this implementation, v3 structure is identical to v2.1
      // We just ensure the format is correct
      v3.servers[name] = this.convertServerConfig(config, version);
    }

    return v3;
  }

  private convertServerConfig(
    v2Config: ServerConfig,
    _version: string,
  ): ServerConfig {
    // Handle schema differences between v2 and v3
    // For now, v3 is backward compatible with v2.1 server configs
    // Just ensure all required fields are present
    const v3Config = { ...v2Config };

    // If v2.0 had "type" field instead of "source", rename it
    if (v2Config.type && !v2Config.source) {
      v3Config.source = v2Config.type;
      delete v3Config.type;
    }

    // Ensure defaults are not embedded (let the loader apply them)
    // This keeps the config clean
    if (v3Config.lifecycle === "on-demand") {
      delete v3Config.lifecycle; // default
    }
    if (v3Config.enabled === true) {
      delete v3Config.enabled; // default
    }
    if (v3Config.timeout === 30000) {
      delete v3Config.timeout; // default
    }

    return v3Config;
  }

  private extractAuthConfig(v2: V2Registry): AuthConfig | null {
    // Check for auth settings in v2 gateway config
    const gateway = v2.gateway;
    if (!gateway) return null;

    // v2.0 had auth directly in gateway object
    // v2.1 deprecated these fields in favor of .mcp-gateway.json
    const hasAuth =
      gateway.disableAuth !== undefined ||
      (gateway.allowedIPs && gateway.allowedIPs.length > 0);

    if (!hasAuth) return null;

    return {
      version: "3.0",
      auth: {
        enabled: !gateway.disableAuth,
        strategies: {
          apiKey: {
            enabled: true,
          },
        },
        ipAllowlist: gateway.allowedIPs || [],
      },
    };
  }

  private validateV3Registry(registry: V3Registry): void {
    // Basic validation - ensure required fields are present
    if (!registry.version) {
      throw new Error("Missing version field");
    }
    if (registry.version !== "3.0") {
      throw new Error(`Invalid version: ${registry.version}, expected 3.0`);
    }
    if (!registry.servers || typeof registry.servers !== "object") {
      throw new Error("Missing or invalid servers object");
    }

    // Validate each server has required fields
    for (const [name, server] of Object.entries(registry.servers)) {
      if (!server.source) {
        throw new Error(`Server ${name}: missing 'source' field`);
      }
      const validSources = ["pkg", "git", "container", "remote", "local"];
      if (!validSources.includes(server.source)) {
        throw new Error(`Server ${name}: invalid source '${server.source}'`);
      }
    }
  }
}
