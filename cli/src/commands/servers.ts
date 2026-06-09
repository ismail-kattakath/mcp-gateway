import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { ApiClient } from '../api-client.js';

export function createServersCommand(client: ApiClient): Command {
  const servers = new Command('servers')
    .description('Manage MCP servers');

  // List servers
  servers
    .command('list')
    .alias('ls')
    .description('List all MCP servers')
    .action(async () => {
      const spinner = ora('Fetching servers...').start();
      try {
        const { servers: serverList } = await client.listServers();
        spinner.stop();

        if (Object.keys(serverList).length === 0) {
          console.log(chalk.yellow('No servers configured'));
          return;
        }

        const data = [
          [
            chalk.bold('Name'),
            chalk.bold('State'),
            chalk.bold('PID'),
            chalk.bold('Uptime'),
          ],
          ...Object.values(serverList).map((s) => [
            s.serverName,
            s.state === 'running' ? chalk.green(s.state) : chalk.gray(s.state),
            s.pid ? s.pid.toString() : chalk.gray('—'),
            s.uptime ? formatUptime(s.uptime) : chalk.gray('—'),
          ]),
        ];

        console.log(table(data));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to list servers: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Get server details
  servers
    .command('get <name>')
    .description('Get server details')
    .action(async (name: string) => {
      const spinner = ora(`Fetching ${name}...`).start();
      try {
        const server = await client.getServer(name);
        spinner.stop();

        console.log(chalk.bold('\nServer Details:'));
        console.log(chalk.cyan('Name:'), server.name);
        console.log(chalk.cyan('State:'), server.status.state === 'running' ? chalk.green(server.status.state) : chalk.gray(server.status.state));
        console.log(chalk.cyan('PID:'), server.status.pid || chalk.gray('—'));
        console.log(chalk.cyan('Uptime:'), server.status.uptime ? formatUptime(server.status.uptime) : chalk.gray('—'));

        console.log(chalk.bold('\nConfiguration:'));
        console.log(JSON.stringify(server.config, null, 2));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to get server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Create server
  servers
    .command('create <name>')
    .description('Create a new MCP server')
    .requiredOption('-s, --source <type>', 'Server source: pkg, git, container, remote, local')
    .requiredOption('-c, --command <cmd>', 'Command to execute')
    .option('-a, --args <args...>', 'Command arguments')
    .option('--enabled', 'Enable server (default: true)', true)
    .option('--lifecycle <type>', 'Lifecycle: persistent, on-demand (default: on-demand)', 'on-demand')
    .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
    .action(async (name: string, options: {
      source: string;
      command: string;
      args?: string[];
      enabled: boolean;
      lifecycle: string;
      timeout: string;
    }) => {
      const spinner = ora(`Creating server ${name}...`).start();
      try {
        const config = {
          source: options.source as 'pkg' | 'git' | 'container' | 'remote' | 'local',
          command: options.command,
          args: options.args || [],
          enabled: options.enabled,
          lifecycle: options.lifecycle as 'persistent' | 'on-demand',
          timeout: parseInt(options.timeout, 10),
        };

        await client.createServer(name, config);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} created successfully`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to create server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Start server
  servers
    .command('start <name>')
    .description('Start an MCP server')
    .action(async (name: string) => {
      const spinner = ora(`Starting ${name}...`).start();
      try {
        await client.startServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} started`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to start server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Stop server
  servers
    .command('stop <name>')
    .description('Stop an MCP server')
    .action(async (name: string) => {
      const spinner = ora(`Stopping ${name}...`).start();
      try {
        await client.stopServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} stopped`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to stop server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Restart server
  servers
    .command('restart <name>')
    .description('Restart an MCP server')
    .action(async (name: string) => {
      const spinner = ora(`Restarting ${name}...`).start();
      try {
        await client.restartServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} restarted`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to restart server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Enable server
  servers
    .command('enable <name>')
    .description('Enable an MCP server')
    .action(async (name: string) => {
      const spinner = ora(`Enabling ${name}...`).start();
      try {
        await client.enableServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} enabled`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to enable server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Disable server
  servers
    .command('disable <name>')
    .description('Disable an MCP server')
    .action(async (name: string) => {
      const spinner = ora(`Disabling ${name}...`).start();
      try {
        await client.disableServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} disabled`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to disable server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Delete server
  servers
    .command('delete <name>')
    .alias('rm')
    .description('Delete an MCP server')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name: string, options: { force?: boolean }) => {
      if (!options.force) {
        console.log(chalk.yellow(`⚠️  Are you sure you want to delete ${chalk.bold(name)}?`));
        console.log(chalk.gray('Run with --force to skip confirmation'));
        process.exit(1);
      }

      const spinner = ora(`Deleting ${name}...`).start();
      try {
        await client.deleteServer(name);
        spinner.succeed(chalk.green(`Server ${chalk.bold(name)} deleted`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to delete server: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return servers;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
