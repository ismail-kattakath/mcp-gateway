import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as keytar from "keytar";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const KEYCHAIN_SERVICE = "mcp-gateway";
const KEYCHAIN_ACCOUNT = "api-key";
const AUTH_CONFIG_FILENAME = ".mcp-gateway.json";

interface AuthConfig {
  disableAuth?: boolean;
  allowedIPs?: string[];
}

function getAuthConfigPath(registryPath: string): string {
  // Auth config is in same directory as registry.json
  return resolve(dirname(registryPath), AUTH_CONFIG_FILENAME);
}

function loadAuthConfig(registryPath: string): AuthConfig {
  const configPath = getAuthConfigPath(registryPath);
  if (!existsSync(configPath)) {
    return { disableAuth: false, allowedIPs: [] };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as AuthConfig;
  } catch {
    return { disableAuth: false, allowedIPs: [] };
  }
}

function saveAuthConfig(config: AuthConfig, registryPath: string): void {
  const configPath = getAuthConfigPath(registryPath);
  const cleaned: AuthConfig = { disableAuth: config.disableAuth ?? false };
  if (config.allowedIPs && config.allowedIPs.length > 0) {
    cleaned.allowedIPs = config.allowedIPs;
  }
  writeFileSync(configPath, JSON.stringify(cleaned, null, 2) + "\n");
}

export function createAuthCommand(): Command {
  const auth = new Command("auth").description(
    "Manage authentication settings",
  );

  // Show API token
  auth
    .command("token")
    .description("Display the API key")
    .action(async () => {
      const spinner = ora("Retrieving API key...").start();
      try {
        const apiKey = await keytar.getPassword(
          KEYCHAIN_SERVICE,
          KEYCHAIN_ACCOUNT,
        );
        spinner.stop();

        if (!apiKey) {
          console.log(chalk.yellow("No API key found in keychain"));
          console.log(chalk.gray("The gateway generates a key on first start"));
          process.exit(1);
        }

        console.log(chalk.bold("\nAPI Key:"));
        console.log(chalk.cyan(apiKey));
        console.log(
          chalk.gray("\nUse this key in Authorization header: Bearer <key>"),
        );
      } catch (error) {
        spinner.fail(
          chalk.red(`Failed to retrieve API key: ${(error as Error).message}`),
        );
        process.exit(1);
      }
    });

  // Enable authentication
  auth
    .command("enable")
    .description(
      "Enable authentication (set disableAuth: false in auth config)",
    )
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action((options: { registry: string }) => {
      const spinner = ora("Enabling authentication...").start();
      try {
        const registryPath = resolve(options.registry);
        const config = loadAuthConfig(registryPath);

        if (!config.disableAuth) {
          spinner.info(chalk.yellow("Authentication already enabled"));
          return;
        }

        config.disableAuth = false;
        saveAuthConfig(config, registryPath);

        spinner.succeed(chalk.green("Authentication enabled"));
        console.log(
          chalk.gray(`\nConfig file: ${getAuthConfigPath(registryPath)}`),
        );
        console.log(
          chalk.gray("Restart the gateway for changes to take effect"),
        );
      } catch (error) {
        spinner.fail(
          chalk.red(`Failed to enable auth: ${(error as Error).message}`),
        );
        process.exit(1);
      }
    });

  // Disable authentication
  auth
    .command("disable")
    .description(
      "Disable authentication (set disableAuth: true in auth config)",
    )
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action((options: { registry: string }) => {
      const spinner = ora("Disabling authentication...").start();
      try {
        const registryPath = resolve(options.registry);
        const config = loadAuthConfig(registryPath);

        if (config.disableAuth === true) {
          spinner.info(chalk.yellow("Authentication already disabled"));
          return;
        }

        config.disableAuth = true;
        saveAuthConfig(config, registryPath);

        spinner.warn(chalk.yellow("Authentication disabled"));
        console.log(
          chalk.red(
            "\n⚠️  WARNING: This is insecure for production deployments",
          ),
        );
        console.log(
          chalk.gray(
            "Anyone with network access can call APIs without authentication",
          ),
        );
        console.log(
          chalk.gray(`\nConfig file: ${getAuthConfigPath(registryPath)}`),
        );
        console.log(
          chalk.gray("Restart the gateway for changes to take effect"),
        );
      } catch (error) {
        spinner.fail(
          chalk.red(`Failed to disable auth: ${(error as Error).message}`),
        );
        process.exit(1);
      }
    });

  // Manage IP allowlist
  auth
    .command("allow")
    .description("Manage IP allowlist")
    .argument("[action]", "Action: list, add, remove, clear")
    .argument("[ip]", "IP address or CIDR (required for add/remove)")
    .requiredOption("-r, --registry <path>", "Path to registry.json")
    .action(
      (
        action: string = "list",
        ip: string | undefined,
        options: { registry: string },
      ) => {
        const registryPath = resolve(options.registry);
        const config = loadAuthConfig(registryPath);
        const allowedIPs: string[] = config.allowedIPs || [];

        switch (action) {
          case "list":
            if (allowedIPs.length === 0) {
              console.log(
                chalk.yellow("No IP allowlist configured (all IPs allowed)"),
              );
            } else {
              console.log(chalk.bold("Allowed IPs:"));
              allowedIPs.forEach((ip) => console.log(chalk.cyan(`  • ${ip}`)));
            }
            break;

          case "add":
            if (!ip) {
              console.log(chalk.red("Error: IP address required"));
              console.log(chalk.gray("Usage: mcp auth allow add <ip>"));
              process.exit(1);
            }
            if (allowedIPs.includes(ip)) {
              console.log(chalk.yellow(`${ip} already in allowlist`));
            } else {
              allowedIPs.push(ip);
              config.allowedIPs = allowedIPs;
              saveAuthConfig(config, registryPath);
              console.log(chalk.green(`Added ${ip} to allowlist`));
              console.log(
                chalk.gray("Restart the gateway for changes to take effect"),
              );
            }
            break;

          case "remove":
            if (!ip) {
              console.log(chalk.red("Error: IP address required"));
              console.log(chalk.gray("Usage: mcp auth allow remove <ip>"));
              process.exit(1);
            }
            const index = allowedIPs.indexOf(ip);
            if (index === -1) {
              console.log(chalk.yellow(`${ip} not found in allowlist`));
            } else {
              allowedIPs.splice(index, 1);
              config.allowedIPs = allowedIPs;
              saveAuthConfig(config, registryPath);
              console.log(chalk.green(`Removed ${ip} from allowlist`));
              console.log(
                chalk.gray("Restart the gateway for changes to take effect"),
              );
            }
            break;

          case "clear":
            if (allowedIPs.length === 0) {
              console.log(chalk.yellow("Allowlist already empty"));
            } else {
              config.allowedIPs = [];
              saveAuthConfig(config, registryPath);
              console.log(
                chalk.green("Cleared IP allowlist (all IPs now allowed)"),
              );
              console.log(
                chalk.gray("Restart the gateway for changes to take effect"),
              );
            }
            break;

          default:
            console.log(chalk.red(`Unknown action: ${action}`));
            console.log(chalk.gray("Valid actions: list, add, remove, clear"));
            process.exit(1);
        }
      },
    );

  return auth;
}
