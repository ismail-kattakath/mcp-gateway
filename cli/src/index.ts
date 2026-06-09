#!/usr/bin/env node

/**
 * MCP Gateway CLI - oclif-based command-line interface
 *
 * This is the main entry point for the CLI when running via `npm run dev`.
 * Production builds use bin/run.js as the entry point.
 */

import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });
