/**
 * CLI command: mcp registry version
 * Detect and report registry.json version
 */

import { Command, Flags } from "@oclif/core";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

interface ServerConfig {
  [key: string]: unknown;
}

interface Registry {
  version?: string;
  mcpServers?: Record<string, ServerConfig>; // v2.0
  servers?: Record<string, ServerConfig>; // v2.1+
}

export default class RegistryVersion extends Command {
  static description = "Detect and report registry.json version";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --registry /path/to/registry.json",
  ];

  static flags = {
    registry: Flags.string({
      char: "r",
      description: "Path to registry.json",
      default: "./registry.json",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RegistryVersion);

    try {
      // Read registry
      const registryPath = path.resolve(flags.registry);
      const content = await fs.readFile(registryPath, "utf-8");
      const registry: Registry = JSON.parse(content);

      // Detect version
      const version = this.detectVersion(registry);
      const detectionMethod = this.getDetectionMethod(registry);

      // Display results
      this.log(chalk.bold("Registry Information:"));
      this.log(chalk.gray("─".repeat(50)));
      this.log(chalk.blue("Path:       ") + registryPath);
      this.log(chalk.blue("Version:    ") + chalk.green(version));
      this.log(chalk.blue("Detection:  ") + chalk.gray(detectionMethod));

      // Show server count
      const servers = registry.servers || registry.mcpServers || {};
      const serverCount = Object.keys(servers).length;
      this.log(chalk.blue("Servers:    ") + serverCount);

      // Migration suggestion
      if (version !== "3.0") {
        this.log("");
        this.log(
          chalk.yellow("⚠ This registry is not using the latest v3.0 format."),
        );
        this.log(chalk.gray("To migrate, run:"));
        this.log(
          chalk.cyan(`  mcp migrate from-v2 --registry ${flags.registry}`),
        );
      } else {
        this.log("");
        this.log(chalk.green("✓ Registry is using the latest v3.0 format."));
      }
    } catch (error) {
      const err = error as Error;
      if ((err as any).code === "ENOENT") {
        this.error(chalk.red(`Registry file not found: ${flags.registry}`));
      } else {
        this.error(chalk.red(`Failed to read registry: ${err.message}`));
      }
    }
  }

  private detectVersion(registry: Registry): string {
    // Explicit version field takes precedence
    if (registry.version) return registry.version;

    // Heuristic detection based on structure
    if (registry.mcpServers) return "2.0";
    if (registry.servers) return "2.1";

    // Unknown format
    return "unknown";
  }

  private getDetectionMethod(registry: Registry): string {
    if (registry.version) {
      return "explicit version field";
    }
    if (registry.mcpServers) {
      return "heuristic (mcpServers key)";
    }
    if (registry.servers) {
      return "heuristic (servers key)";
    }
    return "unknown structure";
  }
}
