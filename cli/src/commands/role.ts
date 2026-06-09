/**
 * CLI commands for role management
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Database from 'better-sqlite3';
import { resolve } from 'path';
import { homedir } from 'os';

const DEFAULT_DB_PATH = resolve(homedir(), '.mcp/gateway.db');

interface User {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user' | 'readonly';
  tenant: string | null;
  status: string;
}

interface RoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

const ROLES: Record<string, RoleDefinition> = {
  admin: {
    name: 'admin',
    description: 'Full system access including user and role management',
    permissions: [
      'manage:all',
      'manage:server',
      'manage:tool',
      'manage:user',
      'manage:role',
      'manage:setting',
      'manage:apikey',
      'manage:audit',
    ],
  },
  user: {
    name: 'user',
    description: 'Standard user with server creation and tool execution rights',
    permissions: [
      'read:server',
      'create:server',
      'update:server:own',
      'delete:server:own',
      'read:tool',
      'write:tool',
      'read:user:own',
      'update:user:own',
      'read:role',
      'read:setting',
      'manage:apikey:own',
      'read:audit:own',
    ],
  },
  readonly: {
    name: 'readonly',
    description: 'Read-only access to resources',
    permissions: [
      'read:server',
      'read:tool',
      'read:user:own',
      'read:role',
      'read:setting',
      'read:apikey:own',
      'read:audit:own',
    ],
  },
};

function getDatabasePath(): string {
  return process.env.MCP_GATEWAY_DB_PATH || DEFAULT_DB_PATH;
}

function openDatabase(): Database.Database {
  const dbPath = getDatabasePath();
  try {
    return new Database(dbPath);
  } catch (error) {
    throw new Error(
      `Failed to open database at ${dbPath}: ${(error as Error).message}\n` +
        'Make sure the gateway has been started at least once.'
    );
  }
}

export function createRoleCommand(): Command {
  const role = new Command('role').description('Manage user roles and permissions (RBAC)');

  // List available roles
  role
    .command('list')
    .description('List all available roles and their permissions')
    .action(() => {
      console.log(chalk.bold('\nAvailable Roles:\n'));

      for (const [name, def] of Object.entries(ROLES)) {
        console.log(chalk.cyan.bold(`${name.toUpperCase()}`));
        console.log(chalk.gray(`  ${def.description}`));
        console.log(chalk.gray('  Permissions:'));
        def.permissions.forEach((perm) => {
          console.log(chalk.gray(`    - ${perm}`));
        });
        console.log();
      }
    });

  // Assign role to user
  role
    .command('assign <username> <role>')
    .description('Assign a role to a user')
    .action((username: string, roleName: string) => {
      const spinner = ora(`Assigning role ${roleName} to ${username}...`).start();

      try {
        // Validate role
        if (!ROLES[roleName]) {
          spinner.fail(chalk.red(`Invalid role: ${roleName}`));
          console.log(chalk.gray('\nAvailable roles: admin, user, readonly'));
          process.exit(1);
        }

        const db = openDatabase();

        // Find user
        const user = db
          .prepare('SELECT * FROM users WHERE username = ?')
          .get(username) as User | undefined;

        if (!user) {
          spinner.fail(chalk.red(`User not found: ${username}`));
          db.close();
          process.exit(1);
        }

        // Update role
        db.prepare('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?').run(
          roleName,
          user.id
        );

        db.close();

        spinner.succeed(chalk.green(`Role assigned successfully`));
        console.log(chalk.gray(`\nUser: ${username}`));
        console.log(chalk.gray(`Role: ${roleName}`));
        console.log(chalk.gray(`\nPermissions:`));
        ROLES[roleName].permissions.forEach((perm) => {
          console.log(chalk.gray(`  - ${perm}`));
        });
      } catch (error) {
        spinner.fail(chalk.red(`Failed to assign role: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Check permissions for a user
  role
    .command('check <username> <action> <resource>')
    .description('Check if a user has permission for an action on a resource')
    .action((username: string, action: string, resource: string) => {
      const spinner = ora(`Checking permissions for ${username}...`).start();

      try {
        const db = openDatabase();

        // Find user
        const user = db
          .prepare('SELECT * FROM users WHERE username = ?')
          .get(username) as User | undefined;

        if (!user) {
          spinner.fail(chalk.red(`User not found: ${username}`));
          db.close();
          process.exit(1);
        }

        db.close();

        // Check permission
        const rolePerms = ROLES[user.role]?.permissions || [];
        const hasManageAll = rolePerms.includes('manage:all');
        const hasManageResource = rolePerms.includes(`manage:${resource}`);
        const hasActionResource = rolePerms.includes(`${action}:${resource}`);
        const hasActionOwn = rolePerms.includes(`${action}:${resource}:own`);

        const hasPermission =
          hasManageAll || hasManageResource || hasActionResource || hasActionOwn;

        spinner.stop();

        console.log(chalk.bold(`\nPermission Check:`));
        console.log(chalk.gray(`User: ${username}`));
        console.log(chalk.gray(`Role: ${user.role}`));
        console.log(chalk.gray(`Action: ${action}`));
        console.log(chalk.gray(`Resource: ${resource}`));
        console.log();

        if (hasPermission) {
          console.log(chalk.green('✓ ALLOWED'));
          if (hasManageAll) {
            console.log(chalk.gray('  Reason: User has manage:all permission'));
          } else if (hasManageResource) {
            console.log(chalk.gray(`  Reason: User has manage:${resource} permission`));
          } else if (hasActionResource) {
            console.log(chalk.gray(`  Reason: User has ${action}:${resource} permission`));
          } else if (hasActionOwn) {
            console.log(
              chalk.gray(`  Reason: User has ${action}:${resource}:own permission (own resources only)`)
            );
          }
        } else {
          console.log(chalk.red('✗ DENIED'));
          console.log(chalk.gray(`  Reason: User lacks required permission`));
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed to check permissions: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Show role for a user
  role
    .command('show <username>')
    .description('Show the role assigned to a user')
    .action((username: string) => {
      const spinner = ora(`Fetching role for ${username}...`).start();

      try {
        const db = openDatabase();

        // Find user
        const user = db
          .prepare('SELECT * FROM users WHERE username = ?')
          .get(username) as User | undefined;

        if (!user) {
          spinner.fail(chalk.red(`User not found: ${username}`));
          db.close();
          process.exit(1);
        }

        db.close();

        spinner.succeed(chalk.green('Role information:'));
        console.log(chalk.gray(`\nUser: ${username}`));
        console.log(chalk.gray(`Email: ${user.email || 'N/A'}`));
        console.log(chalk.gray(`Role: ${user.role}`));
        console.log(chalk.gray(`Tenant: ${user.tenant || 'default'}`));
        console.log(chalk.gray(`Status: ${user.status}`));
        console.log(chalk.gray(`\nPermissions:`));
        ROLES[user.role].permissions.forEach((perm) => {
          console.log(chalk.gray(`  - ${perm}`));
        });
      } catch (error) {
        spinner.fail(chalk.red(`Failed to fetch role: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return role;
}
