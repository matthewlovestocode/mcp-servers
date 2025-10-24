# MCP Servers

## What
- Collection of Model Context Protocol (MCP) servers that extend Codex-style agents with integrations for GitHub and Slack.
- Each server is written in TypeScript and ships with a compiled `dist/` bundle for CLI execution.

## Why
- Provide reusable automations for common developer workflows (GitHub repo management, pull request operations, Slack notifications).
- Keep integration logic isolated so multiple assistants can share the same tooling without duplicating code.

## Where
- `servers/gh-mcp` – GitHub-focused MCP server exposing repository discovery, git workflow helpers, and GitHub pull request tooling.
- `servers/slack-mcp` – Slack webhook MCP server for rich announcements and pull request summaries.
- Each server maintains its own `README.md` and `CHANGELOG.md` to document usage and release notes.

## How
- Install dependencies per server with `npm install`, then build via `npm run build` to generate `dist/`.
- Run a server over stdio with `node dist/index.js`, or use `npm run dev` for watch mode where available.
- Configure credentials using each server’s `.env` template (for example `GITHUB_TOKEN` for GitHub, `SLACK_WEBHOOK_URL` for Slack).
- When updating functionality, record the changes in the corresponding `CHANGELOG.md` so downstream agents stay in sync.
