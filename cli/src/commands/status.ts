/**
 * CLI Status Command
 *
 * Shows the status of the running MCP Gateway instance.
 *
 * Features:
 * - Reads PID file to detect running instance
 * - Verifies process exists
 * - Reads port discovery file for connection info
 * - Displays port, PID, uptime, version
 */

import { Command } from "@oclif/core";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Port discovery information
 */
interface PortDiscoveryInfo {
  port: number;
  pid: number;
  started: string;
  version: string;
}

export default class Status extends Command {
  static description = "Show MCP Gateway instance status";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    this.log(chalk.bold("\nMCP Gateway Instance Status:"));
    this.log(chalk.gray("─".repeat(50)));

    // Read PID file
    const pid = this.readPidFile();

    if (pid === null) {
      this.log(chalk.yellow("Status:"), chalk.red("Not running"));
      this.log(chalk.gray("\nNo PID file found. Gateway is not running."));
      this.log(chalk.gray("Start the gateway with: npm start"));
      return;
    }

    // Check if process exists
    if (!this.processExists(pid)) {
      this.log(chalk.yellow("Status:"), chalk.red("Not running"));
      this.log(
        chalk.gray(`\nPID file exists (${pid}) but process is not running.`),
      );
      this.log(
        chalk.gray(
          "This indicates a stale PID file. Start the gateway to cleanup.",
        ),
      );
      return;
    }

    // Process is running
    this.log(chalk.cyan("Status:"), chalk.green("Running"));
    this.log(chalk.cyan("PID:"), pid);

    // Read discovery file for additional info
    const info = this.readDiscoveryFile();

    if (info) {
      this.log(chalk.cyan("Port:"), info.port);
      this.log(chalk.cyan("Version:"), info.version);
      this.log(chalk.cyan("Started:"), new Date(info.started).toLocaleString());
      this.log(chalk.cyan("Uptime:"), this.formatUptime(info.started));
      this.log(
        chalk.cyan("URL:"),
        chalk.underline(`http://localhost:${info.port}`),
      );

      this.log(chalk.gray("\nEndpoints:"));
      this.log(chalk.gray(`  Health:  http://localhost:${info.port}/health`));
      this.log(chalk.gray(`  API:     http://localhost:${info.port}/api`));
      this.log(chalk.gray(`  Docs:    http://localhost:${info.port}/docs`));
      this.log(chalk.gray(`  UI:      http://localhost:${info.port}/`));
    } else {
      this.log(
        chalk.gray("\nNo discovery file found. Some details unavailable."),
      );
    }

    this.log(chalk.gray("\nManagement:"));
    this.log(
      chalk.gray(
        "  Stop:    kill " + pid + " (or Ctrl+C in the server terminal)",
      ),
    );
    this.log(chalk.gray("  Logs:    mcp logs"));
  }

  private getPidFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, ".mcp-gateway", "gateway.pid");
  }

  private getDiscoveryFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, ".mcp-gateway", "gateway.port");
  }

  private readPidFile(): number | null {
    const pidPath = this.getPidFilePath();

    try {
      if (!fs.existsSync(pidPath)) {
        return null;
      }

      const pidStr = fs.readFileSync(pidPath, "utf8").trim();
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid) || pid <= 0) {
        return null;
      }

      return pid;
    } catch {
      return null;
    }
  }

  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EPERM") {
        return true; // Process exists but we don't have permission
      }
      return false;
    }
  }

  private readDiscoveryFile(): PortDiscoveryInfo | null {
    const discoveryPath = this.getDiscoveryFilePath();

    try {
      if (!fs.existsSync(discoveryPath)) {
        return null;
      }

      const json = fs.readFileSync(discoveryPath, "utf8");
      const info = JSON.parse(json) as PortDiscoveryInfo;

      if (
        typeof info.port !== "number" ||
        typeof info.pid !== "number" ||
        typeof info.started !== "string" ||
        typeof info.version !== "string"
      ) {
        return null;
      }

      return info;
    } catch {
      return null;
    }
  }

  private formatUptime(startedStr: string): string {
    const started = new Date(startedStr);
    const now = new Date();
    const ms = now.getTime() - started.getTime();

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
