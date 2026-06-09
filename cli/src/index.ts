#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "./api-client.js";
import { createServersCommand } from "./commands/servers.js";
import { createLogsCommand } from "./commands/logs.js";
import { createAuthCommand } from "./commands/auth.js";
import { createStatusCommand } from "./commands/status.js";
import { createRoleCommand } from "./commands/role.js";

const program = new Command();

program
  .name("mcp")
  .description("MCP Gateway CLI - Manage Model Context Protocol servers")
  .version("2.1.0")
  .option("--debug", "Enable debug output", false)
  .option("--url <url>", "Gateway base URL", "http://localhost:3000")
  .option("--no-auth", "Disable authentication (for development)");

program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();

  // Initialize API client with global options
  const client = new ApiClient({
    baseUrl: opts.url,
    debug: opts.debug,
    disableAuth: !opts.auth, // Note: commander converts --no-auth to auth: false
  });

  // Store client in command context for subcommands
  thisCommand.setOptionValue("_client", client);
});

// Add subcommands
program.addCommand(
  createServersCommand(program.opts()._client || new ApiClient()),
);
program.addCommand(
  createLogsCommand(program.opts()._client || new ApiClient()),
);
program.addCommand(createAuthCommand());
program.addCommand(createStatusCommand());
program.addCommand(createRoleCommand());

// Health check command
program
  .command("health")
  .description("Check gateway health status")
  .action(async () => {
    const opts = program.opts();
    const client = new ApiClient({
      baseUrl: opts.url,
      debug: opts.debug,
      disableAuth: !opts.auth,
    });

    try {
      const health = await client.health();

      console.log(chalk.bold("\nGateway Health:"));
      console.log(
        chalk.cyan("Status:"),
        health.status === "ok" ? chalk.green("OK") : chalk.red("ERROR"),
      );
      console.log(chalk.cyan("Version:"), health.version);
      console.log(chalk.cyan("Uptime:"), formatUptime(health.uptime * 1000));

      console.log(chalk.bold("\nServers:"));
      console.log(chalk.cyan("Total:"), health.servers.total);
      console.log(chalk.cyan("Enabled:"), health.servers.enabled);
      console.log(chalk.cyan("Running:"), health.servers.running);

      if (health.servers.list.length > 0) {
        console.log(chalk.cyan("Active:"), health.servers.list.join(", "));
      }
    } catch (error) {
      console.error(
        chalk.red(`Failed to check health: ${(error as Error).message}`),
      );
      process.exit(1);
    }
  });

program.parse();

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
