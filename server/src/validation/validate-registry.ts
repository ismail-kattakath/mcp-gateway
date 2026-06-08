#!/usr/bin/env node

/**
 * CLI tool to validate registry.json
 *
 *   node validate-registry.js [path-to-registry.json]
 *   npm run validate
 */

import { validateRegistryFile } from './registry-validator.js';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Registry } from '../types/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Stats {
  total: number;
  enabled: number;
  bySource: Record<string, number>;
  byLifecycle: { 'on-demand': number; persistent: number };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let registryPath = args[0];

  if (registryPath === undefined) {
    registryPath = path.resolve(__dirname, '../../../registry.json');
    // eslint-disable-next-line no-console
    console.log(`Validating default registry: ${registryPath}\n`);
  } else {
    registryPath = path.resolve(process.cwd(), registryPath);
    // eslint-disable-next-line no-console
    console.log(`Validating registry: ${registryPath}\n`);
  }

  try {
    const result = await validateRegistryFile(registryPath);
    // eslint-disable-next-line no-console
    console.log('Registry validation passed.\n');

    if (result.warnings !== undefined && result.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Found ${result.warnings.length} warning(s) — see above.\n`);
    }

    const fs = await import('fs/promises');
    const content = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content) as Registry;

    const stats: Stats = {
      total: 0,
      enabled: 0,
      bySource: {},
      byLifecycle: { 'on-demand': 0, persistent: 0 },
    };

    for (const server of Object.values(registry.servers)) {
      stats.total++;
      if (server.enabled !== false) {
        stats.enabled++;
      }
      stats.bySource[server.source] = (stats.bySource[server.source] ?? 0) + 1;
      const lc = server.lifecycle ?? 'on-demand';
      stats.byLifecycle[lc] = (stats.byLifecycle[lc] ?? 0) + 1;
    }

    // eslint-disable-next-line no-console
    console.log('Registry stats:');
    // eslint-disable-next-line no-console
    console.log(`  Total servers: ${stats.total}`);
    // eslint-disable-next-line no-console
    console.log(`  Enabled: ${stats.enabled} | Disabled: ${stats.total - stats.enabled}`);
    // eslint-disable-next-line no-console
    console.log(
      `  On-demand: ${stats.byLifecycle['on-demand']} | Persistent: ${stats.byLifecycle.persistent}`
    );
    // eslint-disable-next-line no-console
    console.log('  By source:');
    for (const [src, count] of Object.entries(stats.bySource).sort()) {
      // eslint-disable-next-line no-console
      console.log(`    ${src.padEnd(12)} ${count}`);
    }
    // eslint-disable-next-line no-console
    console.log('');

    process.exit(0);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      validationErrors?: unknown;
      semanticErrors?: unknown;
      parseError?: unknown;
    };
    if (err.code === 'ENOENT') {
      console.error(`File not found: ${registryPath}\n`);
    } else if (
      err.validationErrors === undefined &&
      err.semanticErrors === undefined &&
      err.parseError === undefined
    ) {
      console.error(`Unexpected error: ${err.message}\n`);
      if (process.env.DEBUG === 'true') {
        console.error(err.stack);
      }
    }
    process.exit(1);
  }
}

main().catch((error: Error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
