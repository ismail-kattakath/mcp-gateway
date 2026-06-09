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

import { Command } from "commander";
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

/**
 * Get the PID file path
 */
function getPidFilePath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".mcp-gateway", "gateway.pid");
}

/**
 * Get the port discovery file path
 */
function getDiscoveryFilePath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".mcp-gateway", "gateway.port");
}

/**
 * Read PID from file
 */
function readPidFile(): number | null {
  const pidPath = getPidFilePath();

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
  } catch (error) {
    return null;
  }
}

/**
 * Check if process exists
 */
function processExists(pid: number): boolean {
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

/**
 * Read port discovery file
 */
function readDiscoveryFile(): PortDiscoveryInfo | null {
  const discoveryPath = getDiscoveryFilePath();

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
  } catch (error) {
    return null;
  }
}

/**
 * Format uptime
 */
function formatUptime(startedStr: string): string {
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

/**
 * Create status command
 */
export function createStatusCommand(): Command {
  const cmd = new Command("status");

  cmd.description("Show MCP Gateway instance status").action(() => {
    console.log(chalk.bold("\nMCP Gateway Instance Status:"));
    console.log(chalk.gray("─".repeat(50)));

    // Read PID file
    const pid = readPidFile();

    if (pid === null) {
      console.log(chalk.yellow("Status:"), chalk.red("Not running"));
      console.log(chalk.gray("\nNo PID file found. Gateway is not running."));
      console.log(chalk.gray("Start the gateway with: npm start"));
      return;
    }

    // Check if process exists
    if (!processExists(pid)) {
      console.log(chalk.yellow("Status:"), chalk.red("Not running"));
      console.log(
        chalk.gray(`\nPID file exists (${pid}) but process is not running.`),
      );
      console.log(
        chalk.gray(
          "This indicates a stale PID file. Start the gateway to cleanup.",
        ),
      );
      return;
    }

    // Process is running
    console.log(chalk.cyan("Status:"), chalk.green("Running"));
    console.log(chalk.cyan("PID:"), pid);

    // Read discovery file for additional info
    const info = readDiscoveryFile();

    if (info) {
      console.log(chalk.cyan("Port:"), info.port);
      console.log(chalk.cyan("Version:"), info.version);
      console.log(
        chalk.cyan("Started:"),
        new Date(info.started).toLocaleString(),
      );
      console.log(chalk.cyan("Uptime:"), formatUptime(info.started));
      console.log(
        chalk.cyan("URL:"),
        chalk.underline(`http://localhost:${info.port}`),
      );

      console.log(chalk.gray("\nEndpoints:"));
      console.log(
        chalk.gray(`  Health:  http://localhost:${info.port}/health`),
      );
      console.log(chalk.gray(`  API:     http://localhost:${info.port}/api`));
      console.log(chalk.gray(`  Docs:    http://localhost:${info.port}/docs`));
      console.log(chalk.gray(`  UI:      http://localhost:${info.port}/`));
    } else {
      console.log(
        chalk.gray("\nNo discovery file found. Some details unavailable."),
      );
    }

    console.log(chalk.gray("\nManagement:"));
    console.log(
      chalk.gray(
        "  Stop:    kill " + pid + " (or Ctrl+C in the server terminal)",
      ),
    );
    console.log(chalk.gray("  Logs:    mcp logs"));
  });

  return cmd;
}
