# GitHub MCP Server

TypeScript implementation of a Model Context Protocol (MCP) server that exposes GitHub data and tools.

## Features

- Lists repositories for a user, organization, or the authenticated account.
- Retrieves detailed metadata for a specific issue or pull request.
- Performs GitHub issue searches using the REST API.
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
- `get-issue` – Fetches metadata for a GitHub issue or pull request.
- `search-issues` – Executes an issue/PR search using GitHub's search syntax.
- `create-pull-request` – Opens a new pull request targeting a repository/branch.
- `approve-pull-request` – Submits an approval review for a pull request.
- `merge-pull-request` – Merges a pull request using merge, squash, or rebase strategies.

## Resource

- `github://rate-limit` – Returns the remaining rate limit for the authenticated token.

## Linting

Run ESLint over the TypeScript sources:

```bash
npm run lint
```
