# Changelog

## [1.1.0](https://github.com/ismail-kattakath/mcp-gateway/compare/v1.0.0...v1.1.0) (2026-06-08)


### Features

* push tools/list_changed notifications on registry reload ([#6](https://github.com/ismail-kattakath/mcp-gateway/issues/6)) ([ff9d908](https://github.com/ismail-kattakath/mcp-gateway/commit/ff9d908aaae7af8e28e2e4d6f8e4a90a7ac24d08))

## [1.0.0](https://github.com/ismail-kattakath/mcp-gateway/compare/v0.1.0...v1.0.0) (2026-06-08)


### ⚠ BREAKING CHANGES

* registry.json schema redesigned. The 11 backend types are collapsed into 5 sources (pkg/git/container/remote/local) with a flatter shape closer to standard MCP client config. OAuth subsystem removed; env vars now resolve plainly from .env. See CLAUDE.md for the full schema.

### Features

* rewrite registry to 5-source model, add Docker distribution and release automation ([#1](https://github.com/ismail-kattakath/mcp-gateway/issues/1)) ([305f31d](https://github.com/ismail-kattakath/mcp-gateway/commit/305f31dfa360fd0036cc9803c8468cf2e9c620d7))
