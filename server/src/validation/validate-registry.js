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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  let registryPath = args[0];

  if (!registryPath) {
    registryPath = path.resolve(__dirname, '../../../registry.json');
    console.log(`Validating default registry: ${registryPath}\n`);
  } else {
    registryPath = path.resolve(process.cwd(), registryPath);
    console.log(`Validating registry: ${registryPath}\n`);
  }

  try {
    const result = await validateRegistryFile(registryPath);
    console.log('Registry validation passed.\n');

    if (result.warnings && result.warnings.length > 0) {
      console.log(`Found ${result.warnings.length} warning(s) — see above.\n`);
    }

    const fs = await import('fs/promises');
    const content = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content);

    const stats = {
      total: 0,
      enabled: 0,
      bySource: {},
      byLifecycle: { 'on-demand': 0, 'persistent': 0 }
    };

    for (const server of Object.values(registry.servers)) {
      stats.total++;
      if (server.enabled !== false) stats.enabled++;
      stats.bySource[server.source] = (stats.bySource[server.source] || 0) + 1;
      const lc = server.lifecycle || 'on-demand';
      stats.byLifecycle[lc] = (stats.byLifecycle[lc] || 0) + 1;
    }

    console.log('Registry stats:');
    console.log(`  Total servers: ${stats.total}`);
    console.log(`  Enabled: ${stats.enabled} | Disabled: ${stats.total - stats.enabled}`);
    console.log(`  On-demand: ${stats.byLifecycle['on-demand']} | Persistent: ${stats.byLifecycle.persistent}`);
    console.log('  By source:');
    for (const [src, count] of Object.entries(stats.bySource).sort()) {
      console.log(`    ${src.padEnd(12)} ${count}`);
    }
    console.log('');

    process.exit(0);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`File not found: ${registryPath}\n`);
    } else if (!error.validationErrors && !error.semanticErrors && !error.parseError) {
      console.error(`Unexpected error: ${error.message}\n`);
      if (process.env.DEBUG) console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
