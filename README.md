# MCP Gateway Platform

Universal aggregator and manager for Model Context Protocol (MCP) servers. Connect all your AI coding tools (Claude Code, Claude Desktop, Cline, Cursor) to a single gateway endpoint.

## Features

- 🎯 **Single Source of Truth**: One `registry.json` for all MCP backends
- 🔄 **Universal Transport**: SSE/HTTPS for compatibility with all clients
- 🐳 **11 Backend Types**: NPX, Docker, Git repos, Python packages, local scripts, remote servers
- 🔐 **OAuth Integration**: Auto-manage GitHub, Smithery tokens
- 📊 **Web Dashboard**: Visual config editor, logs, metrics
- 🌍 **Deploy Anywhere**: Local development or remote server
- ⚡ **Lazy Loading**: Backends spawn on-demand
- 📝 **Centralized Logging**: All MCP calls in one place

## Quick Start

```bash
# Development
docker-compose up

# Access UI
open http://localhost:3000
```

Configure your AI tool to point to the gateway:

```json
{
  "gateway": {
    "url": "http://localhost:3000/sse",
    "transport": "sse"
  }
}
```

## Architecture

```
AI Coding Tools → MCP Gateway (SSE) → Backend Registry → MCP Backends
                                                          (npx, docker, git, etc.)
```

The gateway:
1. Aggregates multiple MCP servers into one endpoint
2. Namespaces tools to avoid conflicts (`obs/start_recording`)
3. Manages backend lifecycle (on-demand vs persistent)
4. Handles OAuth token refresh automatically
5. Provides web UI for configuration

## Backend Types

| Type | Example |
|------|---------|
| `npx` | `obs-mcp`, `kapture-mcp` |
| `uvx`/`pipx` | Python MCP servers |
| `docker` | `ghcr.io/user/mcp-server` |
| `git-npm` | Private GitHub repo with npm build |
| `git-python` | Private repo with Python setup |
| `git-docker` | Repo with Dockerfile |
| `local` | Local development server |
| `remote-sse` | Smithery hosted MCPs |
| `remote-http` | HTTP-based MCPs |
| `shell` | Custom wrapper scripts |

## Documentation

- **[CLAUDE.md](CLAUDE.md)**: Complete technical documentation
- **Development**: See `.claude/agents/` for component-specific guides
- **Schema**: `schema/registry-v2.schema.json` for registry format

## Project Status

🚧 **In Development** - Initial implementation in progress

## Contributing

This is a personal project but contributions welcome. See `CLAUDE.md` for architecture details.

## License

MIT
