# MCP Gateway Documentation

Complete documentation for the MCP Gateway project.

## Quick Links

- [Main README](../README.md) - Project overview and quick start
- [Contributing Guidelines](../CONTRIBUTING.md) - How to contribute
- [Changelog](../CHANGELOG.md) - Release history

---

## Documentation

### Architecture
- [System Design & Decisions](architecture/decisions.md) - Architecture, design rationale, security model, and key technical decisions

### Development


### Reference
- [Registry Schema](../schema/registry-v2.schema.json) - JSON Schema for registry.json (source of truth)
- [TypeScript Types](../types/registry.d.ts) - TypeScript type definitions

---

## For End Users

### Quick Start
Start here: **[Main README](../README.md)**
- Why use MCP Gateway
- Docker quick start
- Registry configuration basics
- Authentication setup

### Deployment & Operations
**[Main README](../README.md)** and **[System Design](architecture/decisions.md)**
- Registry schema (5 source types: pkg/git/container/remote/local)
- Authenticated access (Bearer token + IP allowlist)
- Docker trust tiers for container source
- Production checklist

### Security & Architecture
**[System Design](architecture/decisions.md)**
- Security architecture and threat model
- Auto-generated API key rationale
- Keychain + encrypted fallback design
- Defense layers

---

## For Developers

### Getting Started
- **[Contributing Guide](../CONTRIBUTING.md)** - Conventional Commits, PR requirements, release automation
- **[System Design](architecture/decisions.md)** - Architecture diagrams, design decisions, technology choices

### Development Guides

### Reference
- **[Registry Schema](../schema/registry-v2.schema.json)** - JSON Schema with all 5 source types
- **[TypeScript Types](../types/registry.d.ts)** - Type definitions mirroring the schema

---


## Changelog

- **[Project Changelog](../CHANGELOG.md)** - Auto-generated release notes

---

## Need Help?

- 🐛 [Report a bug](https://github.com/ismail-kattakath/mcp-gateway/issues)
- 💡 [Request a feature](https://github.com/ismail-kattakath/mcp-gateway/issues)
- 💬 [Ask a question](https://github.com/ismail-kattakath/mcp-gateway/discussions)

---

## Documentation Standards

When updating documentation:

- Keep docs up to date with code changes
- Use clear, concise language
- Include examples where helpful
- Update links when moving files
- Follow the structure above
