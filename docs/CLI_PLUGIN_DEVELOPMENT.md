# CLI Plugin Development Guide

This guide explains how to develop plugins for the MCP Gateway CLI using oclif's plugin system.

## Overview

The MCP Gateway CLI is built on oclif, which provides a powerful plugin architecture. Plugins can:

- Add new commands under custom topics
- Extend existing commands with additional functionality
- Share common utilities across commands
- Be distributed via npm

## Plugin Structure

A typical plugin follows this structure:

```
mcp-plugin-example/
├── package.json          # Plugin manifest with oclif config
├── src/
│   ├── commands/         # Command implementations
│   │   └── example/
│   │       ├── hello.ts  # Example command
│   │       └── world.ts  # Another command
│   ├── hooks/            # Optional hooks for lifecycle events
│   └── index.ts          # Plugin entry point (optional)
├── test/                 # Tests
└── README.md             # Plugin documentation
```

## Creating a Plugin

### 1. Initialize the plugin

```bash
mkdir mcp-plugin-example
cd mcp-plugin-example
npm init -y
npm install @oclif/core
npm install -D typescript @types/node
```

### 2. Configure package.json

```json
{
  "name": "mcp-plugin-example",
  "version": "1.0.0",
  "description": "Example plugin for MCP Gateway CLI",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "oclif": {
    "commands": "./dist/commands",
    "bin": "mcp",
    "topics": {
      "example": {
        "description": "Example plugin commands"
      }
    }
  },
  "files": ["/dist", "/oclif.manifest.json"],
  "keywords": ["mcp", "mcp-plugin"]
}
```

### 3. Create a command

Create `src/commands/example/hello.ts`:

```typescript
import { Command, Flags } from "@oclif/core";

export default class ExampleHello extends Command {
  static description = "Say hello from the example plugin";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --name World",
  ];

  static flags = {
    name: Flags.string({
      char: "n",
      description: "Name to greet",
      default: "World",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExampleHello);
    this.log(`Hello, ${flags.name}!`);
  }
}
```

### 4. Build the plugin

```bash
npm run build  # Compiles TypeScript
oclif manifest # Generates oclif.manifest.json
```

## Using Shared Base Commands

To access MCP Gateway API functionality, extend the `BaseCommand` class:

```typescript
import { BaseCommand } from "@mcp-gateway/cli";
import chalk from "chalk";

export default class ExampleStatus extends BaseCommand {
  static description = "Check server status with enhanced formatting";

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    try {
      const { servers } = await this.client.listServers();

      this.log(chalk.bold("\nServer Status:"));
      for (const [name, status] of Object.entries(servers)) {
        const stateColor =
          status.state === "running" ? chalk.green : chalk.gray;
        this.log(`  ${name}: ${stateColor(status.state)}`);
      }
    } catch (error) {
      this.error(`Failed to fetch servers: ${(error as Error).message}`);
    }
  }
}
```

## Plugin Hooks

Plugins can register hooks to run before/after commands:

```typescript
// src/hooks/init.ts
import { Hook } from "@oclif/core";

const hook: Hook<"init"> = async function (opts) {
  console.log("Plugin initialized!");
};

export default hook;
```

Register hooks in `package.json`:

```json
{
  "oclif": {
    "hooks": {
      "init": "./dist/hooks/init"
    }
  }
}
```

Available hooks:

- `init` - Before command runs
- `prerun` - After init, before command
- `postrun` - After command completes
- `command_not_found` - When command doesn't exist

## Installing Plugins

### Local development

```bash
# Link plugin for development
cd /path/to/mcp-plugin-example
npm link

cd /path/to/mcp-gateway/cli
npm link mcp-plugin-example
```

### From npm

```bash
mcp plugins install mcp-plugin-example
```

### From GitHub

```bash
mcp plugins install user/repo
```

## Plugin Discovery

The CLI automatically discovers plugins that match these patterns:

- Installed in `node_modules/` with name matching `mcp-plugin-*`
- Listed in the CLI's `package.json` dependencies
- Installed via `mcp plugins install`

## Testing Plugins

Create tests using your preferred framework (Vitest, Jest, Mocha):

```typescript
// test/commands/example/hello.test.ts
import { expect, test } from "@oclif/test";

describe("example:hello", () => {
  test
    .stdout()
    .command(["example:hello"])
    .it("runs hello command", (ctx) => {
      expect(ctx.stdout).to.contain("Hello, World!");
    });

  test
    .stdout()
    .command(["example:hello", "--name", "Alice"])
    .it("runs hello with custom name", (ctx) => {
      expect(ctx.stdout).to.contain("Hello, Alice!");
    });
});
```

## Best Practices

### 1. Command Naming

- Use clear, descriptive command names
- Group related commands under topics
- Follow existing CLI conventions

### 2. Error Handling

```typescript
try {
  const result = await this.client.doSomething();
  this.log(chalk.green("Success!"));
} catch (error) {
  // Use this.error() to exit with code 1
  this.error(chalk.red(`Failed: ${(error as Error).message}`));
}
```

### 3. User Feedback

- Use `ora` for spinners during long operations
- Use `chalk` for colored output
- Provide clear error messages
- Show examples in help text

### 4. Configuration

Access CLI config and flags:

```typescript
async run(): Promise<void> {
  const { flags } = await this.parse(MyCommand);

  // Access oclif config
  this.config.version; // CLI version
  this.config.configDir; // Config directory

  // Access shared flags from BaseCommand
  const apiUrl = flags.url;
  const debug = flags.debug;
}
```

### 5. API Client Usage

Always use the inherited `this.client` from `BaseCommand`:

```typescript
// ✅ Good
class MyCommand extends BaseCommand {
  async run(): Promise<void> {
    const servers = await this.client.listServers();
  }
}

// ❌ Bad - creates new client
class MyCommand extends Command {
  async run(): Promise<void> {
    const client = new ApiClient();
  }
}
```

## Publishing Plugins

### 1. Prepare for release

```bash
npm run build
npm test
```

### 2. Version and publish

```bash
npm version patch  # or minor, major
npm publish
```

### 3. Add to plugin registry

Submit a PR to add your plugin to the official registry:

```markdown
## mcp-plugin-example

Example plugin demonstrating plugin development

- **Author**: Your Name
- **Repository**: https://github.com/user/mcp-plugin-example
- **Install**: `mcp plugins install mcp-plugin-example`
```

## Example Plugins

### Simple Command Plugin

```typescript
// src/commands/uptime.ts
import { BaseCommand } from "@mcp-gateway/cli";
import chalk from "chalk";

export default class Uptime extends BaseCommand {
  static description = "Show gateway uptime in human-readable format";

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const health = await this.client.health();

    const uptime = this.formatUptime(health.uptime * 1000);
    this.log(chalk.bold("\nGateway Uptime:"));
    this.log(chalk.cyan(`  ${uptime}`));
    this.log(chalk.gray(`  Version: ${health.version}`));
  }
}
```

### Data Export Plugin

```typescript
// src/commands/export.ts
import { BaseCommand } from "@mcp-gateway/cli";
import { Flags } from "@oclif/core";
import { writeFileSync } from "fs";

export default class Export extends BaseCommand {
  static description = "Export server configurations to JSON";

  static flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: "o",
      description: "Output file path",
      default: "servers-export.json",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const { servers } = await this.client.listServers();

    writeFileSync(flags.output, JSON.stringify(servers, null, 2));
    this.log(
      chalk.green(
        `Exported ${Object.keys(servers).length} servers to ${flags.output}`,
      ),
    );
  }
}
```

## Troubleshooting

### Plugin not discovered

- Check plugin name starts with `mcp-plugin-`
- Verify `oclif` config in package.json
- Run `mcp plugins` to see installed plugins

### Commands not showing

- Ensure `commands` path in oclif config is correct
- Check manifest generation: `npx oclif manifest`
- Verify TypeScript compilation: `npm run build`

### API client errors

- Extend `BaseCommand` to get `this.client`
- Use `--debug` flag to see detailed errors
- Check gateway URL with `--url` flag

## Resources

- [oclif Documentation](https://oclif.io/docs/introduction)
- [oclif Plugin Development](https://oclif.io/docs/plugins)
- [MCP Gateway API Docs](../API.md)
- [CLI Source Code](../cli/src)

## Support

- **Issues**: Report bugs at https://github.com/ismail-kattakath/mcp-gateway/issues
- **Discussions**: Ask questions in GitHub Discussions
- **Examples**: See `examples/` directory for reference implementations
