#!/usr/bin/env node

/**
 * CLI tool to validate registry.json files
 *
 * Usage:
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

  // Default to ../../../registry.json if no path provided
  if (!registryPath) {
    registryPath = path.resolve(__dirname, '../../../registry.json');
    console.log(`📋 Validating default registry: ${registryPath}\n`);
  } else {
    registryPath = path.resolve(process.cwd(), registryPath);
    console.log(`📋 Validating registry: ${registryPath}\n`);
  }

  try {
    const result = await validateRegistryFile(registryPath);

    console.log('✅ Registry validation passed!\n');

    if (result.warnings && result.warnings.length > 0) {
      console.log(`   Found ${result.warnings.length} warning(s) - see above\n`);
    } else {
      console.log('   No issues found\n');
    }

    // Count backends by type
    const fs = await import('fs/promises');
    const content = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content);

    const stats = {
      total: 0,
      enabled: 0,
      byType: {},
      byLifecycle: { 'on-demand': 0, 'persistent': 0 }
    };

    for (const backend of Object.values(registry.backends)) {
      stats.total++;
      if (backend.enabled) stats.enabled++;
      stats.byType[backend.type] = (stats.byType[backend.type] || 0) + 1;
      stats.byLifecycle[backend.lifecycle]++;
    }

    console.log('📊 Registry Statistics:');
    console.log(`   Total backends: ${stats.total}`);
    console.log(`   Enabled: ${stats.enabled} | Disabled: ${stats.total - stats.enabled}`);
    console.log(`   On-demand: ${stats.byLifecycle['on-demand']} | Persistent: ${stats.byLifecycle.persistent}`);
    console.log('\n   By type:');
    for (const [type, count] of Object.entries(stats.byType).sort()) {
      console.log(`     ${type.padEnd(15)} ${count}`);
    }
    console.log('');

    process.exit(0);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ File not found: ${registryPath}\n`);
      console.error('💡 Create a registry.json file or specify a different path\n');
    } else if (!error.validationErrors && !error.semanticErrors && !error.parseError) {
      console.error(`❌ Unexpected error: ${error.message}\n`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }

    process.exit(1);
  }
}

main();
