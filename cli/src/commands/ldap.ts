/**
 * LDAP CLI Commands
 *
 * Commands for managing LDAP/Active Directory providers:
 * - mcp ldap add - Add LDAP provider
 * - mcp ldap update - Update provider config
 * - mcp ldap remove - Remove provider
 * - mcp ldap list - List providers
 * - mcp ldap test - Test connection
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import axios from "axios";

interface LDAPProvider {
  id: string;
  name: string;
  url: string;
  bind_dn: string | null;
  base_dn: string;
  search_filter: string;
  attribute_mapping: Record<string, string>;
  group_mapping: Record<string, string>;
  tls_enabled: boolean;
  tls_reject_unauthorized: boolean;
  pool_size: number;
  timeout: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get API base URL from registry path
 */
function getApiBaseUrl(registryPath: string): string {
  try {
    const registryContent = readFileSync(resolve(registryPath), "utf-8");
    const registry = JSON.parse(registryContent);
    const port = registry.gateway?.port || 3000;
    const host = registry.gateway?.host || "localhost";
    return `http://${host}:${port}`;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * Get API key from environment or keytar
 */
async function getApiKey(): Promise<string | null> {
  // Try environment variable first
  if (process.env.MCP_GATEWAY_API_KEY) {
    return process.env.MCP_GATEWAY_API_KEY;
  }

  // Try keytar
  try {
    const keytar = await import("keytar");
    return await keytar.getPassword("mcp-gateway", "api-key");
  } catch {
    return null;
  }
}

/**
 * Make API request with auth
 */
async function apiRequest<T>(
  method: "get" | "post" | "put" | "delete",
  url: string,
  data?: any,
): Promise<T> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(
      "API key not found. Set MCP_GATEWAY_API_KEY or run gateway to generate key.",
    );
  }

  const response = await axios({
    method,
    url,
    data,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

export function createLdapCommand(): Command {
  const ldap = new Command("ldap").description(
    "Manage LDAP/Active Directory providers",
  );

  /**
   * mcp ldap add <name>
   */
  ldap
    .command("add <name>")
    .description("Add a new LDAP/AD provider")
    .requiredOption(
      "--url <url>",
      "LDAP server URL (e.g., ldap://server:389 or ldaps://server:636)",
    )
    .requiredOption("--base-dn <baseDn>", "Base DN for user searches")
    .option("--bind-dn <bindDn>", "Bind DN for search operations")
    .option("--bind-password <password>", "Bind password")
    .option(
      "--search-filter <filter>",
      "Search filter (default: (uid={{username}}))",
      "(uid={{username}})",
    )
    .option("--attribute-mapping <json>", "Attribute mapping JSON")
    .option("--group-mapping <json>", "Group mapping JSON")
    .option("--tls-enabled <boolean>", "Enable TLS", "true")
    .option(
      "--tls-reject-unauthorized <boolean>",
      "Validate TLS certificate",
      "true",
    )
    .option("--pool-size <number>", "Connection pool size", "5")
    .option("--timeout <number>", "Connection timeout (ms)", "10000")
    .option("--enabled <boolean>", "Enable provider", "true")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action(async (name: string, options: any) => {
      const spinner = ora(`Adding LDAP provider '${name}'...`).start();

      try {
        const baseUrl = getApiBaseUrl(options.registry);

        // Parse JSON options
        const attributeMapping = options.attributeMapping
          ? JSON.parse(options.attributeMapping)
          : {};
        const groupMapping = options.groupMapping
          ? JSON.parse(options.groupMapping)
          : { default: "user" };

        const providerData = {
          name,
          url: options.url,
          bind_dn: options.bindDn || null,
          bind_password: options.bindPassword || null,
          base_dn: options.baseDn,
          search_filter: options.searchFilter,
          attribute_mapping: attributeMapping,
          group_mapping: groupMapping,
          tls_enabled: options.tlsEnabled === "true",
          tls_reject_unauthorized: options.tlsRejectUnauthorized === "true",
          pool_size: parseInt(options.poolSize, 10),
          timeout: parseInt(options.timeout, 10),
          enabled: options.enabled === "true",
        };

        await apiRequest("post", `${baseUrl}/api/ldap/providers`, providerData);

        spinner.succeed(
          chalk.green(`LDAP provider '${name}' added successfully`),
        );

        console.log(chalk.gray("\nConfiguration:"));
        console.log(chalk.gray(`  URL: ${options.url}`));
        console.log(chalk.gray(`  Base DN: ${options.baseDn}`));
        console.log(chalk.gray(`  Search Filter: ${options.searchFilter}`));
        console.log(chalk.gray(`  Enabled: ${options.enabled}`));
      } catch (error) {
        const err = error as any;
        spinner.fail(chalk.red("Failed to add LDAP provider"));

        if (err.response?.data?.error) {
          console.error(chalk.red(`\nError: ${err.response.data.error}`));
        } else {
          console.error(chalk.red(`\nError: ${err.message}`));
        }

        process.exit(1);
      }
    });

  /**
   * mcp ldap update <name>
   */
  ldap
    .command("update <name>")
    .description("Update LDAP/AD provider configuration")
    .option("--url <url>", "LDAP server URL")
    .option("--base-dn <baseDn>", "Base DN for user searches")
    .option("--bind-dn <bindDn>", "Bind DN for search operations")
    .option("--bind-password <password>", "Bind password")
    .option("--search-filter <filter>", "Search filter")
    .option("--attribute-mapping <json>", "Attribute mapping JSON")
    .option("--group-mapping <json>", "Group mapping JSON")
    .option("--tls-enabled <boolean>", "Enable TLS")
    .option("--tls-reject-unauthorized <boolean>", "Validate TLS certificate")
    .option("--pool-size <number>", "Connection pool size")
    .option("--timeout <number>", "Connection timeout (ms)")
    .option("--enabled <boolean>", "Enable/disable provider")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action(async (name: string, options: any) => {
      const spinner = ora(`Updating LDAP provider '${name}'...`).start();

      try {
        const baseUrl = getApiBaseUrl(options.registry);

        // Build update payload (only include specified options)
        const updates: any = {};

        if (options.url) updates.url = options.url;
        if (options.baseDn) updates.base_dn = options.baseDn;
        if (options.bindDn !== undefined)
          updates.bind_dn = options.bindDn || null;
        if (options.bindPassword !== undefined)
          updates.bind_password = options.bindPassword || null;
        if (options.searchFilter) updates.search_filter = options.searchFilter;
        if (options.attributeMapping)
          updates.attribute_mapping = JSON.parse(options.attributeMapping);
        if (options.groupMapping)
          updates.group_mapping = JSON.parse(options.groupMapping);
        if (options.tlsEnabled !== undefined)
          updates.tls_enabled = options.tlsEnabled === "true";
        if (options.tlsRejectUnauthorized !== undefined)
          updates.tls_reject_unauthorized =
            options.tlsRejectUnauthorized === "true";
        if (options.poolSize)
          updates.pool_size = parseInt(options.poolSize, 10);
        if (options.timeout) updates.timeout = parseInt(options.timeout, 10);
        if (options.enabled !== undefined)
          updates.enabled = options.enabled === "true";

        await apiRequest(
          "put",
          `${baseUrl}/api/ldap/providers/${name}`,
          updates,
        );

        spinner.succeed(
          chalk.green(`LDAP provider '${name}' updated successfully`),
        );
      } catch (error) {
        const err = error as any;
        spinner.fail(chalk.red("Failed to update LDAP provider"));

        if (err.response?.data?.error) {
          console.error(chalk.red(`\nError: ${err.response.data.error}`));
        } else {
          console.error(chalk.red(`\nError: ${err.message}`));
        }

        process.exit(1);
      }
    });

  /**
   * mcp ldap remove <name>
   */
  ldap
    .command("remove <name>")
    .description("Remove LDAP/AD provider")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name: string, options: any) => {
      if (!options.yes) {
        console.log(
          chalk.yellow(
            `\nAre you sure you want to remove LDAP provider '${name}'?`,
          ),
        );
        console.log(chalk.gray("This action cannot be undone.\n"));
        console.log(
          chalk.gray(
            "Press Ctrl+C to cancel, or run with --yes to skip this prompt.",
          ),
        );
        process.exit(1);
      }

      const spinner = ora(`Removing LDAP provider '${name}'...`).start();

      try {
        const baseUrl = getApiBaseUrl(options.registry);
        await apiRequest("delete", `${baseUrl}/api/ldap/providers/${name}`);

        spinner.succeed(
          chalk.green(`LDAP provider '${name}' removed successfully`),
        );
      } catch (error) {
        const err = error as any;
        spinner.fail(chalk.red("Failed to remove LDAP provider"));

        if (err.response?.data?.error) {
          console.error(chalk.red(`\nError: ${err.response.data.error}`));
        } else {
          console.error(chalk.red(`\nError: ${err.message}`));
        }

        process.exit(1);
      }
    });

  /**
   * mcp ldap list
   */
  ldap
    .command("list")
    .description("List all LDAP/AD providers")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .option("--json", "Output as JSON")
    .action(async (options: any) => {
      const spinner = ora("Fetching LDAP providers...").start();

      try {
        const baseUrl = getApiBaseUrl(options.registry);
        const providers = await apiRequest<LDAPProvider[]>(
          "get",
          `${baseUrl}/api/ldap/providers`,
        );

        spinner.stop();

        if (providers.length === 0) {
          console.log(chalk.yellow("No LDAP providers configured"));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(providers, null, 2));
          return;
        }

        console.log(chalk.bold(`\n${providers.length} LDAP provider(s):\n`));

        for (const provider of providers) {
          const status = provider.enabled
            ? chalk.green("enabled")
            : chalk.red("disabled");
          console.log(chalk.bold(`${provider.name} (${status})`));
          console.log(chalk.gray(`  URL: ${provider.url}`));
          console.log(chalk.gray(`  Base DN: ${provider.base_dn}`));
          console.log(chalk.gray(`  Search Filter: ${provider.search_filter}`));
          console.log(
            chalk.gray(
              `  TLS: ${provider.tls_enabled ? "enabled" : "disabled"}`,
            ),
          );
          console.log(chalk.gray(`  Pool Size: ${provider.pool_size}`));
          console.log(
            chalk.gray(
              `  Created: ${new Date(provider.created_at).toLocaleString()}`,
            ),
          );
          console.log();
        }
      } catch (error) {
        const err = error as any;
        spinner.fail(chalk.red("Failed to fetch LDAP providers"));

        if (err.response?.data?.error) {
          console.error(chalk.red(`\nError: ${err.response.data.error}`));
        } else {
          console.error(chalk.red(`\nError: ${err.message}`));
        }

        process.exit(1);
      }
    });

  /**
   * mcp ldap test <name>
   */
  ldap
    .command("test <name>")
    .description("Test LDAP/AD connection and authentication")
    .requiredOption("--username <username>", "Username to test")
    .requiredOption("--password <password>", "Password to test")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action(async (name: string, options: any) => {
      const spinner = ora(`Testing LDAP provider '${name}'...`).start();

      try {
        const baseUrl = getApiBaseUrl(options.registry);

        // Test authentication via gateway API
        const response = await axios.post(
          `${baseUrl}/auth/ldap/${name}/login`,
          {
            username: options.username,
            password: options.password,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        spinner.succeed(
          chalk.green(
            `LDAP authentication successful for '${options.username}'`,
          ),
        );

        console.log(chalk.gray("\nUser details:"));
        console.log(chalk.gray(`  User ID: ${response.data.user.id}`));
        console.log(chalk.gray(`  Username: ${response.data.user.username}`));
        console.log(
          chalk.gray(`  Email: ${response.data.user.email || "N/A"}`),
        );
        console.log(chalk.gray(`  Role: ${response.data.user.role}`));
      } catch (error) {
        const err = error as any;
        spinner.fail(chalk.red("LDAP authentication failed"));

        if (err.response?.data?.error) {
          console.error(chalk.red(`\nError: ${err.response.data.error}`));
        } else {
          console.error(chalk.red(`\nError: ${err.message}`));
        }

        process.exit(1);
      }
    });

  return ldap;
}

export default createLdapCommand;
