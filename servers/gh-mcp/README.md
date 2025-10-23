# GitHub MCP Server

TypeScript implementation of a Model Context Protocol (MCP) server that exposes GitHub data and tools.

## Features

- Lists repositories for a user, organization, or the authenticated account.
- Manages local git workflow (create branches, stage changes, commit, cleanup).
- Manages branches on GitHub (create new branches, update, delete).
- Checks combined commit statuses for refs.
- Creates pull requests, submits approval reviews, and merges pull requests (merge, squash, rebase).
- Provides a resource for monitoring rate limit usage.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (or export environment variables) with:

   ```bash
   GITHUB_TOKEN=ghp_your_token_here
   # Optional defaults
   GITHUB_DEFAULT_OWNER=your-org-or-username
   GITHUB_USER_AGENT=custom-user-agent-string
   ```

   The token requires scopes that match the data you plan to access (for example, `repo` to view private repositories).

3. Build the server (generates `dist/`):

   ```bash
   npm run build
   ```

4. Run the MCP server over stdio:

   ```bash
   node dist/index.js
   ```

   During development you can use the watch mode:

   ```bash
   npm run dev
   ```

## Available Tools

- `list-repositories` – Lists repositories for the provided owner (user or org) or falls back to the authenticated account/default owner.
- `create-local-branch` – Creates a new branch in a local git repository.
- `git-status` – Shows the working tree status for a local repository.
- `stage-changes` – Stages files or directories for the next local commit.
- `create-commit` – Creates a commit in the local repository with the supplied message.
- `delete-local-branch` – Deletes a local branch (main is protected).
- `create-branch` – Creates a new branch pointing to a specific commit SHA on GitHub.
- `update-branch` – Moves an existing branch to a different commit, optionally forcing the update.
- `delete-remote-branch` – Deletes a remote branch in GitHub (main is protected).
- `get-commit-status` – Fetches the combined status for a commit SHA or branch.
- `create-pull-request` – Opens a new pull request targeting a repository/branch.
- `approve-pull-request` – Submits an approval review for a pull request.
- `merge-pull-request` – Merges a pull request using merge, squash, or rebase strategies.

## Resource

- `github://rate-limit` – Returns the remaining rate limit for the authenticated token.

## Changelog

All user-visible changes are tracked in [`CHANGELOG.md`](./CHANGELOG.md). Whenever you modify this server, add a concise entry so the agent can keep release notes in sync.

## Linting

Run ESLint over the TypeScript sources:

```bash
npm run lint
```
