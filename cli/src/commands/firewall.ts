import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'path';
import { getApiClient } from '../utils/api-client.js';

/**
 * Firewall CLI commands
 * Related: Epic #23 (Network Security)
 */

export function createFirewallCommand(): Command {
  const firewall = new Command('firewall').description('Manage firewall rules (IP filtering)');

  // List firewall rules
  firewall
    .command('list')
    .alias('ls')
    .description('List all firewall rules')
    .option('-t, --type <type>', 'Filter by rule type (allow/deny)')
    .option('--enabled', 'Show only enabled rules')
    .option('--disabled', 'Show only disabled rules')
    .option('--tenant <tenant>', 'Filter by tenant')
    .action(async (options: { type?: string; enabled?: boolean; disabled?: boolean; tenant?: string }) => {
      const spinner = ora('Loading firewall rules...').start();
      try {
        const client = await getApiClient();

        // Build query params
        const params = new URLSearchParams();
        if (options.type) {
          params.append('rule_type', options.type);
        }
        if (options.enabled) {
          params.append('enabled', 'true');
        } else if (options.disabled) {
          params.append('enabled', 'false');
        }
        if (options.tenant) {
          params.append('tenant', options.tenant);
        }

        const query = params.toString();
        const url = `/api/firewall${query ? `?${query}` : ''}`;
        const response = await client.get(url);

        spinner.stop();

        const rules = response.data;

        if (rules.length === 0) {
          console.log(chalk.yellow('\nNo firewall rules found'));
          console.log(chalk.gray('Add rules with: mcp firewall allow <ip> or mcp firewall deny <ip>'));
          return;
        }

        console.log(chalk.bold(`\nFirewall Rules (${rules.length}):`));
        console.log('');

        rules.forEach((rule: any) => {
          const typeColor = rule.rule_type === 'allow' ? chalk.green : chalk.red;
          const enabledBadge = rule.enabled ? chalk.green('✓') : chalk.gray('✗');

          console.log(`${enabledBadge} ${typeColor(rule.rule_type.toUpperCase().padEnd(6))} ${chalk.cyan(rule.ip_range.padEnd(20))}`);

          if (rule.description) {
            console.log(`  ${chalk.gray(rule.description)}`);
          }

          console.log(chalk.gray(`  ID: ${rule.id}`));
          console.log('');
        });
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to list firewall rules: ${error.message}`));
        process.exit(1);
      }
    });

  // Add allow rule
  firewall
    .command('allow <ip-range>')
    .description('Add IP or CIDR to allowlist')
    .option('-d, --description <text>', 'Rule description')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (ipRange: string, options: { description?: string; tenant?: string }) => {
      const spinner = ora(`Adding allow rule for ${ipRange}...`).start();
      try {
        const client = await getApiClient();

        const payload = {
          ip_range: ipRange,
          rule_type: 'allow',
          description: options.description,
          tenant: options.tenant,
          enabled: true,
        };

        await client.post('/api/firewall', payload);

        spinner.succeed(chalk.green(`Added allow rule for ${ipRange}`));
        console.log(chalk.gray('\nFirewall must be enabled for rules to take effect'));
        console.log(chalk.gray('Enable with: mcp firewall enable'));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to add allow rule: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Add deny rule
  firewall
    .command('deny <ip-range>')
    .description('Add IP or CIDR to denylist')
    .option('-d, --description <text>', 'Rule description')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (ipRange: string, options: { description?: string; tenant?: string }) => {
      const spinner = ora(`Adding deny rule for ${ipRange}...`).start();
      try {
        const client = await getApiClient();

        const payload = {
          ip_range: ipRange,
          rule_type: 'deny',
          description: options.description,
          tenant: options.tenant,
          enabled: true,
        };

        await client.post('/api/firewall', payload);

        spinner.succeed(chalk.green(`Added deny rule for ${ipRange}`));
        console.log(chalk.gray('\nFirewall must be enabled and in blacklist mode for deny rules'));
        console.log(chalk.gray('Configure with: mcp firewall mode blacklist'));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to add deny rule: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Remove rule
  firewall
    .command('remove <id>')
    .alias('rm')
    .description('Remove firewall rule by ID')
    .action(async (id: string) => {
      const spinner = ora(`Removing firewall rule ${id}...`).start();
      try {
        const client = await getApiClient();
        await client.delete(`/api/firewall/${id}`);

        spinner.succeed(chalk.green(`Removed firewall rule ${id}`));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to remove rule: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Enable firewall
  firewall
    .command('enable')
    .description('Enable firewall (IP filtering)')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (options: { tenant?: string }) => {
      const spinner = ora('Enabling firewall...').start();
      try {
        const client = await getApiClient();

        const payload = {
          enabled: true,
        };

        if (options.tenant) {
          payload['tenant'] = options.tenant;
        }

        await client.post('/api/firewall/config', payload);

        spinner.succeed(chalk.green('Firewall enabled'));
        console.log(chalk.gray('\nRestart gateway for changes to take effect'));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to enable firewall: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Disable firewall
  firewall
    .command('disable')
    .description('Disable firewall (allow all traffic)')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (options: { tenant?: string }) => {
      const spinner = ora('Disabling firewall...').start();
      try {
        const client = await getApiClient();

        const payload = {
          enabled: false,
        };

        if (options.tenant) {
          payload['tenant'] = options.tenant;
        }

        await client.post('/api/firewall/config', payload);

        spinner.succeed(chalk.green('Firewall disabled'));
        console.log(chalk.yellow('\n⚠️  WARNING: All traffic is now allowed'));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to disable firewall: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Set firewall mode
  firewall
    .command('mode <mode>')
    .description('Set firewall mode (whitelist or blacklist)')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (mode: string, options: { tenant?: string }) => {
      if (mode !== 'whitelist' && mode !== 'blacklist') {
        console.log(chalk.red('Invalid mode. Must be "whitelist" or "blacklist"'));
        process.exit(1);
      }

      const spinner = ora(`Setting firewall mode to ${mode}...`).start();
      try {
        const client = await getApiClient();

        const payload = {
          mode,
        };

        if (options.tenant) {
          payload['tenant'] = options.tenant;
        }

        await client.post('/api/firewall/config', payload);

        spinner.succeed(chalk.green(`Firewall mode set to ${mode}`));

        if (mode === 'whitelist') {
          console.log(chalk.gray('\nWhitelist mode: Only allowed IPs can connect (default deny)'));
        } else {
          console.log(chalk.gray('\nBlacklist mode: All IPs allowed except denied (default allow)'));
        }
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to set mode: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Test IP against rules
  firewall
    .command('test <ip>')
    .description('Test if an IP would be allowed or denied')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (ip: string, options: { tenant?: string }) => {
      const spinner = ora(`Testing IP ${ip}...`).start();
      try {
        const client = await getApiClient();

        const params = new URLSearchParams();
        if (options.tenant) {
          params.append('tenant', options.tenant);
        }

        const query = params.toString();
        const url = `/api/firewall/test/${ip}${query ? `?${query}` : ''}`;
        const response = await client.get(url);

        spinner.stop();

        const result = response.data;

        if (result.allowed) {
          console.log(chalk.green(`\n✓ IP ${ip} would be ALLOWED`));
        } else {
          console.log(chalk.red(`\n✗ IP ${ip} would be DENIED`));
        }

        console.log(chalk.gray(`Reason: ${result.reason}`));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to test IP: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Show firewall config
  firewall
    .command('config')
    .description('Show current firewall configuration')
    .option('--tenant <tenant>', 'Tenant name')
    .action(async (options: { tenant?: string }) => {
      const spinner = ora('Loading firewall configuration...').start();
      try {
        const client = await getApiClient();

        const params = new URLSearchParams();
        if (options.tenant) {
          params.append('tenant', options.tenant);
        }

        const query = params.toString();
        const url = `/api/firewall/config${query ? `?${query}` : ''}`;
        const response = await client.get(url);

        spinner.stop();

        const config = response.data;

        console.log(chalk.bold('\nFirewall Configuration:'));
        console.log('');
        console.log(`  Enabled:           ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  Mode:              ${config.mode === 'whitelist' ? chalk.green(config.mode) : chalk.yellow(config.mode)}`);
        console.log(`  iptables:          ${config.iptablesEnabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);

        if (config.iptablesEnabled) {
          console.log(`  iptables Chain:    ${config.iptablesChain}`);
          console.log(`  iptables Sudo:     ${config.iptablesSudo ? 'Yes' : 'No'}`);
        }

        console.log('');
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to load config: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  // Flush all rules
  firewall
    .command('flush')
    .description('Remove all firewall rules (WARNING: destructive)')
    .option('--tenant <tenant>', 'Tenant name')
    .option('--confirm', 'Skip confirmation prompt')
    .action(async (options: { tenant?: string; confirm?: boolean }) => {
      if (!options.confirm) {
        console.log(chalk.yellow('\n⚠️  WARNING: This will delete ALL firewall rules'));
        console.log(chalk.gray('Use --confirm flag to proceed'));
        process.exit(1);
      }

      const spinner = ora('Flushing all firewall rules...').start();
      try {
        const client = await getApiClient();

        const params = new URLSearchParams();
        if (options.tenant) {
          params.append('tenant', options.tenant);
        }

        const query = params.toString();
        const url = `/api/firewall/flush${query ? `?${query}` : ''}`;
        await client.post(url);

        spinner.succeed(chalk.green('All firewall rules deleted'));
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to flush rules: ${error.response?.data?.message || error.message}`));
        process.exit(1);
      }
    });

  return firewall;
}
