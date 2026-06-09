# MCP Gateway CLI

Command-line interface for managing MCP Gateway servers.

## Installation

```bash
cd cli
npm install
npm run build

# Link globally (optional)
npm link
```

## Usage

The CLI automatically reads the API key from your system keychain (same location as the gateway stores it), so you don't need to manually provide authentication.

### Global Options

```bash
--debug          Enable debug output
--url <url>      Gateway base URL (default: http://localhost:3000)
--no-auth        Disable authentication (development only)
```

### Commands

#### Health Check

```bash
mcp health
```

#### Server Management

```bash
# List all servers
mcp servers list
mcp servers ls

# Get server details
mcp servers get <name>

# Create new server
mcp servers create <name> \
  --source pkg \
  --command npx \
  --args "-y" "obs-mcp@latest" \
  --enabled \
  --lifecycle on-demand

# Start/stop/restart server
mcp servers start <name>
mcp servers stop <name>
mcp servers restart <name>

# Enable/disable server
mcp servers enable <name>
mcp servers disable <name>

# Delete server
mcp servers delete <name> --force
mcp servers rm <name> -f
```

#### Logs

```bash
# View logs for all servers
mcp logs

# View logs for specific server
mcp logs <server-name>

# Limit output
mcp logs <server-name> --tail 50
mcp logs -n 100
```

#### Authentication

```bash
# Display API key
mcp auth token

# Enable authentication (remove disableAuth from registry)
mcp auth enable
mcp auth enable --registry /path/to/registry.json

# Disable authentication (set disableAuth in registry)
mcp auth disable

# Manage IP allowlist
mcp auth allow list
mcp auth allow add 192.168.1.100
mcp auth allow add 10.0.0.0/8
mcp auth allow remove 192.168.1.100
mcp auth allow clear
```

## Examples

### Create and start a server

```bash
mcp servers create obs-mcp \
  --source pkg \
  --command npx \
  --args "-y" "obs-mcp@latest"

mcp servers start obs-mcp
```

### Monitor server logs

```bash
mcp logs obs-mcp --tail 100
```

### Check gateway health

```bash
mcp health
```

### Debug mode

```bash
mcp --debug servers list
```

### Use different gateway URL

```bash
mcp --url http://192.168.1.100:3000 servers list
```

## Authentication

The CLI automatically retrieves the API key from your system keychain:
- **macOS:** Keychain Access (service: `mcp-gateway`, account: `api-key`)
- **Linux:** libsecret
- **Windows:** Credential Manager

No manual authentication required when using the CLI on the same machine as the gateway.

For remote usage, use environment variables or the `--url` flag:

```bash
# Connect to remote gateway
mcp --url https://gateway.example.com servers list
```

## Development

```bash
# Run without building
npm run dev -- servers list

# Build TypeScript
npm run build

# Type check
npm run type-check

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check
```

## Troubleshooting

### "No API key found in keychain"

The gateway needs to be started at least once to generate the API key:

```bash
cd server
npm start
```

### "Failed to connect"

Check that the gateway is running:

```bash
mcp health
```

Or specify a different URL:

```bash
mcp --url http://localhost:3000 health
```

### Debug mode

Enable debug output to see HTTP requests:

```bash
mcp --debug servers list
```
