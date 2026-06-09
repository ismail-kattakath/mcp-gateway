import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ApiClient, LogEntry } from '../api-client.js';

export function createLogsCommand(client: ApiClient): Command {
  const logs = new Command('logs')
    .description('View MCP server logs')
    .argument('[server]', 'Server name (optional, shows all if omitted)')
    .option('-n, --tail <lines>', 'Number of lines to show', '100')
    .option('-f, --follow', 'Follow log output (not yet implemented)', false)
    .action(async (serverName: string | undefined, options: { tail: string; follow: boolean }) => {
      if (options.follow) {
        console.log(chalk.yellow('⚠️  Follow mode not yet implemented'));
        return;
      }

      const limit = parseInt(options.tail, 10);
      const spinner = ora('Fetching logs...').start();

      try {
        const result = await client.getLogs(serverName, limit);
        spinner.stop();

        if (serverName) {
          // Single server logs
          const entries = result.logs || [];
          if (entries.length === 0) {
            console.log(chalk.yellow(`No logs found for ${serverName}`));
            return;
          }

          console.log(chalk.bold(`\nLogs for ${serverName} (last ${entries.length}):\n`));
          entries.forEach(formatLogEntry);
        } else {
          // All servers logs
          const servers = result.servers || {};
          const serverNames = Object.keys(servers);

          if (serverNames.length === 0) {
            console.log(chalk.yellow('No logs available'));
            return;
          }

          for (const name of serverNames) {
            const entries = servers[name];
            console.log(chalk.bold(`\n${name} (${entries.length} entries):`));
            entries.forEach(formatLogEntry);
          }
        }
      } catch (error) {
        spinner.fail(chalk.red(`Failed to fetch logs: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return logs;
}

function formatLogEntry(entry: LogEntry): void {
  const timestamp = new Date(entry.timestamp).toLocaleString();
  let levelColor = chalk.white;

  switch (entry.level) {
    case 'error':
      levelColor = chalk.red;
      break;
    case 'warn':
      levelColor = chalk.yellow;
      break;
    case 'info':
      levelColor = chalk.cyan;
      break;
    case 'debug':
      levelColor = chalk.gray;
      break;
  }

  const stream = entry.stream === 'stderr' ? chalk.red('[stderr]') : chalk.gray('[stdout]');
  console.log(`${chalk.gray(timestamp)} ${levelColor(entry.level.toUpperCase().padEnd(5))} ${stream} ${entry.message}`);
}
