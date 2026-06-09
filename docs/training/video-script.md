# MCP Gateway v3.0 Quick Start Video Script

Narration script for a 10-minute quick start video.

## Scene 1: Introduction (0:00-1:00)

**[On screen: MCP Gateway logo and title]**

Hello! Welcome to MCP Gateway v3.0. I'm going to show you how to set up and use MCP Gateway in just 10 minutes.

MCP Gateway is a universal aggregator for Model Context Protocol servers. Instead of configuring multiple MCP servers in every AI tool you use - like Claude Code, Claude Desktop, or Cursor - you configure them once in the gateway, and point all your tools to it.

**[On screen: Problem/Solution comparison]**

Think of it as a single point of control for all your MCP servers. You get centralized authentication, monitoring, and management - all in one place.

Let's dive in!

## Scene 2: Installation (1:00-2:30)

**[On screen: Terminal]**

First, let's install MCP Gateway. There are three ways to install it, but we'll use Docker because it's the quickest.

All you need is this one command:

```bash
docker run -i --rm ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**[Type and execute command]**

That's it! The gateway is now running. Notice it auto-starts with some example servers already configured.

**[On screen: Health check]**

Let's verify it's working:

```bash
curl http://localhost:3000/health
```

**[Show JSON response]**

Perfect! The gateway is up and healthy.

## Scene 3: Configuration (2:30-4:30)

**[On screen: Text editor with registry.json]**

Now let's configure our own MCP server. Create a file called `registry.json`:

```json
{
  "version": "3.0",
  "servers": {
    "filesystem": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true,
      "lifecycle": "on-demand"
    }
  }
}
```

**[Highlight different parts as you explain]**

Let me explain this configuration:

- `version`: We're using registry format 3.0
- `servers`: This is where we define our servers
- `filesystem`: That's the server name - it becomes the namespace for tools
- `source: "pkg"`: We're using a package manager source
- `command` and `args`: This tells the gateway how to run the server
- `lifecycle: "on-demand"`: The server starts when first used, not immediately

**[Save file]**

Now restart the gateway with our custom registry:

```bash
docker run -i --rm \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**[Show gateway starting]**

## Scene 4: Connecting AI Tools (4:30-6:30)

**[On screen: Claude Code config file]**

Now let's connect Claude Code to our gateway. Open your Claude Code configuration file at `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "${HOME}/.mcp-gateway/registry.json:/app/registry.json:ro",
        "ghcr.io/ismail-kattakath/mcp-gateway:latest"
      ]
    }
  }
}
```

**[Save file and restart Claude Code]**

That's it! Claude Code will now auto-spawn the gateway when it starts.

**[On screen: Claude Code interface]**

Let's test it. In Claude Code, I'll ask Claude to list the contents of the /tmp directory.

**[Type in Claude Code]**

"Can you list the files in /tmp using the filesystem server?"

**[Show Claude using filesystem/list_directory tool]**

Perfect! Claude is now using the filesystem/list_directory tool from our gateway.

## Scene 5: CLI Management (6:30-8:00)

**[On screen: Terminal]**

MCP Gateway also includes a powerful CLI for management. Let's install it:

```bash
cd cli
npm install && npm run build && npm link
```

**[Show installation]**

Now we can use the `mcp` command:

```bash
# List all servers
mcp servers list

# View server details
mcp servers get filesystem

# Check logs
mcp logs filesystem

# Create a new server
mcp servers create git \
  --source pkg \
  --command npx \
  --args "-y" "git-mcp"
```

**[Execute each command and show output]**

The CLI makes it easy to manage servers without editing configuration files directly.

## Scene 6: Authentication (8:00-9:00)

**[On screen: Terminal]**

By default, MCP Gateway is secure. It auto-generates an API key and stores it in your system keychain.

To get your API key:

```bash
PRINT_API_KEY=true npm start
```

**[Show key output, censored on screen]**

You can use this key for API requests:

```bash
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:3000/api/servers
```

**[Show JSON response]**

MCP Gateway also supports enterprise authentication like OAuth, SAML, and LDAP. Check out the tutorials in the documentation for setup guides.

## Scene 7: Next Steps & Conclusion (9:00-10:00)

**[On screen: Documentation links]**

Congratulations! You've successfully set up MCP Gateway, configured a server, connected Claude Code, and learned the basics of CLI management.

Here's what to explore next:

1. **Add more servers**: Try git, container, remote, and local sources
2. **Set up authentication**: OAuth, SAML, or LDAP for teams
3. **Deploy to production**: Kubernetes manifests and Helm charts included
4. **Enable monitoring**: Prometheus + Grafana dashboards
5. **Explore RBAC**: Role-based access control for teams

**[On screen: Resources]**

Check out these resources:

- Documentation: Full user guide and API reference
- Tutorials: 6 step-by-step tutorials for advanced features
- Community: GitHub discussions for questions and support

**[On screen: MCP Gateway logo]**

Thanks for watching! If you found this helpful, star the project on GitHub and share it with your team.

Happy coding!

**[Fade out]**

---

## Video Production Notes

**Total Duration:** 10 minutes

**Screen Recording:**

- Terminal (clear, large font)
- Text editor (syntax highlighting)
- Claude Code interface (if allowed)

**Assets Needed:**

- MCP Gateway logo
- Animated diagrams (architecture, request flow)
- Code snippets (pre-formatted, syntax highlighted)

**Post-Production:**

- Background music (subtle, non-distracting)
- Annotations and highlights for key points
- Chapter markers for YouTube
- Closed captions (auto-generated + manual review)

**Publishing:**

- YouTube: Main channel
- Vimeo: Enterprise embed
- GitHub: Link in README
