import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { GitHubServerConfig } from "./config.js";
import {
  GitHubClient,
  IssueSummary,
  MergeResult,
  PullRequestReview,
  PullRequestSummary,
  RepositorySummary
} from "./githubClient.js";

export function createGitHubServer(config: GitHubServerConfig): McpServer {
  const server = new McpServer(
    {
      name: "gh-mcp",
      version: "0.1.0"
    },
    {
      instructions: [
        "GitHub MCP Server",
        "",
        "Configure using environment variables:",
        "- GITHUB_TOKEN (required) personal access token or GitHub App installation token.",
        "- GITHUB_DEFAULT_OWNER (optional) default owner/org for repository operations.",
        "- GITHUB_USER_AGENT (optional) override default User-Agent header.",
        "",
        "Available tools:",
        "- list-repositories: list repositories for the configured owner or authenticated user.",
        "- get-issue: fetch a specific issue with metadata.",
        "- search-issues: run an issues or PR search using GitHub's search syntax.",
        "- create-pull-request: open a new pull request against the target repository.",
        "- approve-pull-request: approve an open pull request.",
        "- merge-pull-request: merge a pull request using merge, squash, or rebase."
      ].join("\n")
    }
  );

  const client = new GitHubClient(config.token, config.userAgent);

  const listRepositoriesArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("GitHub username or organization login."),
      ownerType: z
        .enum(["user", "org"])
        .describe("Treat the owner as a user or organization.")
        .default("user"),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of repositories to return (max 100)."),
      includePrivate: z
        .boolean()
        .default(false)
        .describe(
          "When true, include private repositories accessible to the token."
        )
    })
    .describe(
      "List repositories for the supplied owner or the authenticated user."
    );

  server.tool(
    "list-repositories",
    "List repositories accessible to the GitHub token.",
    listRepositoriesArgs.shape,
    async (rawArgs: unknown) => {
      const args = listRepositoriesArgs.parse(rawArgs);

      const owner = args.owner ?? config.defaultOwner;

      if (!owner && args.ownerType === "org") {
        return toolError(
          "Specify an organization via the `owner` argument or GITHUB_DEFAULT_OWNER."
        );
      }

      const repositories = await client.listRepositories({
        owner,
        ownerType: args.ownerType,
        perPage: args.perPage,
        includePrivate: args.includePrivate
      });

      if (repositories.length === 0) {
        return toolText("No repositories found for the provided criteria.");
      }

      const text = repositories
        .map((repo) => formatRepository(repo))
        .join("\n\n");

      return toolText(text);
    }
  );

  const getIssueArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      issueNumber: z
        .number()
        .int()
        .positive()
        .describe("Issue or pull request number.")
    })
    .describe("Retrieve a single issue or pull request.");

  server.tool(
    "get-issue",
    "Fetch metadata for a specific GitHub issue or pull request.",
    getIssueArgs.shape,
    async (rawArgs: unknown) => {
      const args = getIssueArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const issue = await client.getIssue({
        owner,
        repo: args.repo,
        issueNumber: args.issueNumber
      });

      return toolText(formatIssue(issue));
    }
  );

  const searchIssuesArgs = z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          "GitHub search query. Examples: `repo:owner/name is:open is:pr label:bug`."
        ),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of items to return (max 100).")
    })
    .describe("Search issues or pull requests using GitHub's search syntax.");

  server.tool(
    "search-issues",
    "Run a GitHub issues or pull request search.",
    searchIssuesArgs.shape,
    async (rawArgs: unknown) => {
      const args = searchIssuesArgs.parse(rawArgs);
      const result = await client.searchIssues({
        query: args.query,
        perPage: args.perPage
      });

      if (result.items.length === 0) {
        return toolText(
          `No issues matched the query. Total matches reported by GitHub: ${result.totalCount}.`
        );
      }

      const formattedIssues = result.items
        .map((issue) => formatIssue(issue))
        .join("\n\n---\n\n");

      const summary = `GitHub returned ${result.totalCount} matching issues. Showing up to ${result.items.length}.`;

      return toolText(`${summary}\n\n${formattedIssues}`);
    }
  );

  const createPullRequestArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      title: z.string().min(1).describe("Title for the pull request."),
      head: z
        .string()
        .min(1)
        .describe(
          "The name of the branch where changes are implemented. Accepts `user:branch` for cross-fork PRs."
        ),
      base: z
        .string()
        .min(1)
        .describe("The branch you want to merge into (usually `main`)."),
      body: z
        .string()
        .optional()
        .describe("Optional markdown body/description for the pull request."),
      draft: z
        .boolean()
        .default(false)
        .describe("Create the pull request in draft mode."),
      maintainerCanModify: z
        .boolean()
        .default(true)
        .describe("Allow maintainers to update the head branch.")
    })
    .describe("Create a new pull request.");

  server.tool(
    "create-pull-request",
    "Create a pull request targeting the specified repository.",
    createPullRequestArgs.shape,
    async (rawArgs: unknown) => {
      const args = createPullRequestArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const pr = await client.createPullRequest({
        owner,
        repo: args.repo,
        title: args.title,
        head: args.head,
        base: args.base,
        body: args.body,
        draft: args.draft,
        maintainerCanModify: args.maintainerCanModify
      });

      return toolText(`Created pull request:\n\n${formatPullRequest(pr)}`);
    }
  );

  const approvePullRequestArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      pullNumber: z
        .number()
        .int()
        .positive()
        .describe("Pull request number."),
      body: z
        .string()
        .optional()
        .describe("Optional review comment body.")
    })
    .describe("Approve an open pull request.");

  server.tool(
    "approve-pull-request",
    "Submit an approval review for a pull request.",
    approvePullRequestArgs.shape,
    async (rawArgs: unknown) => {
      const args = approvePullRequestArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const review = await client.approvePullRequest({
        owner,
        repo: args.repo,
        pullNumber: args.pullNumber,
        body: args.body
      });

      return toolText(`Submitted approval review:\n\n${formatReview(review)}`);
    }
  );

  const mergePullRequestArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      pullNumber: z
        .number()
        .int()
        .positive()
        .describe("Pull request number."),
      mergeMethod: z
        .enum(["merge", "squash", "rebase"])
        .default("merge")
        .describe("Merge strategy to use."),
      commitTitle: z
        .string()
        .optional()
        .describe("Optional commit title (merge and squash)."),
      commitMessage: z
        .string()
        .optional()
        .describe("Optional commit message (merge and squash)."),
      expectedHeadSha: z
        .string()
        .optional()
        .describe(
          "Optional expected head SHA to ensure the PR hasn't changed before merging."
        )
    })
    .describe("Merge a pull request using the specified strategy.");

  server.tool(
    "merge-pull-request",
    "Merge a pull request (merge, squash, or rebase).",
    mergePullRequestArgs.shape,
    async (rawArgs: unknown) => {
      const args = mergePullRequestArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const result = await client.mergePullRequest({
        owner,
        repo: args.repo,
        pullNumber: args.pullNumber,
        mergeMethod: args.mergeMethod,
        commitTitle: args.commitTitle,
        commitMessage: args.commitMessage,
        expectedHeadSha: args.expectedHeadSha
      });

      if (!result?.merged) {
        return toolError(
          `Merge unsuccessful: ${result?.message ?? "Unknown error."}`
        );
      }

      return toolText(`Merged pull request:\n\n${formatMergeResult(result)}`);
    }
  );

  server.resource(
    "rate-limit",
    "github://rate-limit",
    async () => {
      const info = await client.getRateLimit();
      const text = [
        "GitHub REST API rate limits:",
        "",
        `Core: ${info.core.remaining}/${info.core.limit} remaining (resets ${formatReset(
          info.core.reset
        )})`,
        `Search: ${info.search.remaining}/${info.search.limit} remaining (resets ${formatReset(
          info.search.reset
        )})`,
        info.graphql
          ? `GraphQL: ${info.graphql.remaining}/${info.graphql.limit} remaining (resets ${formatReset(
              info.graphql.reset
            )})`
          : undefined
      ]
        .filter(Boolean)
        .join("\n");

      return {
        contents: [
          {
            uri: "github://rate-limit",
            type: "text",
            text
          }
        ]
      };
    }
  );

  return server;
}

function toolText(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function toolError(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

function formatRepository(repo: RepositorySummary): string {
  const visibility = repo.visibility ?? (repo.private ? "private" : "public");
  const updated = repo.pushed_at
    ? new Date(repo.pushed_at).toISOString()
    : "unknown";

  return [
    `${repo.full_name} (${visibility})`,
    repo.description ? `Description: ${repo.description}` : undefined,
    `Default branch: ${repo.default_branch}`,
    `Stars: ${repo.stargazers_count}, Open issues: ${repo.open_issues_count}`,
    repo.language ? `Primary language: ${repo.language}` : undefined,
    `Last push: ${updated}`,
    `URL: ${repo.html_url}`
  ]
    .filter(Boolean)
    .join("\n");
}

function formatIssue(issue: IssueSummary): string {
  const lines = [
    `${issue.html_url}`,
    `${issue.title} (#${issue.number})`,
    `State: ${issue.state}, Comments: ${issue.comments}`,
    `Author: ${issue.user.login}`,
    issue.assignees.length
      ? `Assignees: ${issue.assignees.map((a) => a.login).join(", ")}`
      : undefined,
    issue.labels.length
      ? `Labels: ${issue.labels
          .map((label) => label.name)
          .filter(Boolean)
          .join(", ")}`
      : undefined,
    `Created: ${new Date(issue.created_at).toISOString()}`,
    `Updated: ${new Date(issue.updated_at).toISOString()}`,
    issue.closed_at ? `Closed: ${new Date(issue.closed_at).toISOString()}` : "",
    issue.body ? `\n${issue.body}` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}

function formatPullRequest(pr: PullRequestSummary): string {
  const lines = [
    pr.html_url,
    `${pr.title} (#${pr.number})`,
    `Author: ${pr.user.login}`,
    `State: ${pr.state}${pr.draft ? " (draft)" : ""}`,
    `Base: ${pr.base.repo.full_name}@${pr.base.ref}`,
    `Head: ${pr.head.label}`,
    `Created: ${new Date(pr.created_at).toISOString()}`,
    `Updated: ${new Date(pr.updated_at).toISOString()}`,
    pr.merged_at
      ? `Merged: ${new Date(pr.merged_at).toISOString()}`
      : undefined,
    pr.body ? `\n${pr.body}` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}

function formatReview(review: PullRequestReview): string {
  const lines = [
    review.html_url,
    `Reviewer: ${review.user.login}`,
    `State: ${review.state}`,
    `Submitted: ${new Date(review.submitted_at).toISOString()}`,
    review.body ? `\n${review.body}` : undefined
  ];

  return lines.filter(Boolean).join("\n");
}

function formatMergeResult(result: MergeResult): string {
  const lines = [
    `Merged: ${result.merged ? "yes" : "no"}`,
    result.sha ? `Commit: ${result.sha}` : undefined,
    result.merged_by ? `Merged by: ${result.merged_by.login}` : undefined,
    `Message: ${result.message}`
  ];

  return lines.filter(Boolean).join("\n");
}

function formatReset(resetEpochSeconds: number): string {
  return new Date(resetEpochSeconds * 1000).toISOString();
}
