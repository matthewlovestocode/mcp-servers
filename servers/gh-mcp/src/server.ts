import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { GitHubServerConfig } from "./config.js";
import {
  GitHubClient,
  GitReference,
  CombinedCommitStatus,
  MergeResult,
  PullRequestReview,
  PullRequestSummary,
  RepositorySummary
} from "./githubClient.js";
import {
  createLocalBranch,
  createCommit as createLocalCommit,
  deleteLocalBranch,
  GitLocalError,
  getStatus as getLocalStatus,
  stageChanges
} from "./gitLocal.js";

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
        "- create-local-branch: create a local git branch at the provided path.",
        "- git-status: show the current working tree status for a local repository.",
        "- stage-changes: add files or folders to the next local commit.",
        "- create-commit: create a local commit with a message (optionally empty/signoff).",
        "- get-commit-status: fetch the combined CI status for a commit SHA or ref.",
        "- delete-local-branch: delete a local branch (excluding main).",
        "- delete-remote-branch: delete a remote branch on GitHub (excluding main).",
        "- create-branch: create a new branch pointing at a commit SHA.",
        "- update-branch: move an existing branch to a different commit.",
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

  const localRepositoryArgs = z.object({
    repoPath: z
      .string()
      .min(1)
      .describe("Path to the local git repository (relative or absolute).")
  });

  const createLocalBranchArgs = localRepositoryArgs
    .extend({
      branch: z
        .string()
        .min(1)
        .describe("Name of the local branch to create."),
      startPoint: z
        .string()
        .optional()
        .describe("Optional starting point (commit or branch) for the new branch.")
    })
    .describe("Create a new local git branch at the specified repository path.");

  server.tool(
    "create-local-branch",
    "Create a new local git branch in the given repository path.",
    createLocalBranchArgs.shape,
    async (rawArgs: unknown) => {
      const args = createLocalBranchArgs.parse(rawArgs);

      try {
        await createLocalBranch({
          repoPath: args.repoPath,
          branch: args.branch,
          startPoint: args.startPoint
        });

        return toolText(
          `Created local branch '${args.branch}' in ${args.repoPath}.`
        );
      } catch (error) {
        return handleGitError(error);
      }
    }
  );

  const gitStatusArgs = localRepositoryArgs
    .describe("Show the working tree status for a local repository.");

  server.tool(
    "git-status",
    "Show git status (short) for a local repository.",
    gitStatusArgs.shape,
    async (rawArgs: unknown) => {
      const args = gitStatusArgs.parse(rawArgs);

      try {
        const result = await getLocalStatus({ repoPath: args.repoPath });
        const output = result.stdout || "Working tree clean.";
        return toolText(output);
      } catch (error) {
        return handleGitError(error);
      }
    }
  );

  const stageChangesArgs = localRepositoryArgs
    .extend({
      paths: z
        .array(z.string().min(1))
        .optional()
        .describe("Paths to stage. Defaults to all changes when omitted.")
    })
    .describe("Stage files or directories for the next commit.");

  server.tool(
    "stage-changes",
    "Stage files or directories for the next local commit.",
    stageChangesArgs.shape,
    async (rawArgs: unknown) => {
      const args = stageChangesArgs.parse(rawArgs);

      try {
        await stageChanges({
          repoPath: args.repoPath,
          paths: args.paths
        });

        const descriptor = args.paths?.length
          ? args.paths.join(", ")
          : "all changes";
        return toolText(`Staged ${descriptor} in ${args.repoPath}.`);
      } catch (error) {
        return handleGitError(error);
      }
    }
  );

  const createCommitArgs = localRepositoryArgs
    .extend({
      message: z
        .string()
        .min(1)
        .describe("Commit message."),
      allowEmpty: z
        .boolean()
        .default(false)
        .describe("Allow creating an empty commit."),
      signoff: z
        .boolean()
        .default(false)
        .describe("Add a Signed-off-by trailer to the commit message.")
    })
    .describe("Create a commit in the local repository.");

  server.tool(
    "create-commit",
    "Create a local commit with the provided message.",
    createCommitArgs.shape,
    async (rawArgs: unknown) => {
      const args = createCommitArgs.parse(rawArgs);

      try {
        const result = await createLocalCommit({
          repoPath: args.repoPath,
          message: args.message,
          allowEmpty: args.allowEmpty,
          signoff: args.signoff
        });

        const output = result.stdout || "Created commit.";
        return toolText(output);
      } catch (error) {
        return handleGitError(error);
      }
    }
  );

  const deleteLocalBranchArgs = localRepositoryArgs
    .extend({
      branch: z
        .string()
        .min(1)
        .describe("Local branch name to delete (main is protected)."),
      force: z
        .boolean()
        .default(false)
        .describe("Force delete the branch, ignoring unmerged commits.")
    })
    .describe("Delete a local branch (excluding main).");

  server.tool(
    "delete-local-branch",
    "Delete a local branch (excluding main).",
    deleteLocalBranchArgs.shape,
    async (rawArgs: unknown) => {
      const args = deleteLocalBranchArgs.parse(rawArgs);

      if (args.branch.trim() === "main") {
        return toolError("Refusing to delete the local main branch.");
      }

      try {
        await deleteLocalBranch({
          repoPath: args.repoPath,
          branch: args.branch,
          force: args.force
        });

        return toolText(
          `Deleted local branch '${args.branch}' from ${args.repoPath}.`
        );
      } catch (error) {
        return handleGitError(error);
      }
    }
  );

  const createBranchArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      branch: z
        .string()
        .min(1)
        .describe(
          "Branch name to create. You may include the full ref (e.g. `refs/heads/feature`)."
        ),
      sha: z
        .string()
        .min(1)
        .describe("Commit SHA that the new branch should point to.")
    })
    .describe("Create a new Git branch at the provided commit SHA.");

  server.tool(
    "create-branch",
    "Create a new branch pointing at a commit.",
    createBranchArgs.shape,
    async (rawArgs: unknown) => {
      const args = createBranchArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const ref = await client.createBranch({
        owner,
        repo: args.repo,
        branch: args.branch,
        sha: args.sha
      });

      return toolText(`Created branch:\n\n${formatGitReference(ref)}`);
    }
  );

  const updateBranchArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      branch: z
        .string()
        .min(1)
        .describe(
          "Branch name to update. Prefix `refs/heads/` is optional."
        ),
      sha: z
        .string()
        .min(1)
        .describe("Commit SHA the branch should point to."),
      force: z
        .boolean()
        .default(false)
        .describe(
          "When true, allow moving the branch backward (force update)."
        )
    })
    .describe("Update an existing branch to point at a new commit SHA.");

  server.tool(
    "update-branch",
    "Move an existing branch to another commit.",
    updateBranchArgs.shape,
    async (rawArgs: unknown) => {
      const args = updateBranchArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const ref = await client.updateBranch({
        owner,
        repo: args.repo,
        branch: args.branch,
        sha: args.sha,
        force: args.force
      });

      return toolText(`Updated branch:\n\n${formatGitReference(ref)}`);
    }
  );

  const getCommitStatusArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      ref: z
        .string()
        .min(1)
        .describe("Commit SHA or branch name to check.")
    })
    .describe("Fetch the combined status for a commit SHA or ref.");

  server.tool(
    "get-commit-status",
    "Fetch the combined status for the provided commit SHA or ref.",
    getCommitStatusArgs.shape,
    async (rawArgs: unknown) => {
      const args = getCommitStatusArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const status = await client.getCommitStatus({
        owner,
        repo: args.repo,
        ref: args.ref
      });

      return toolText(formatCommitStatus(status));
    }
  );

  const deleteRemoteBranchArgs = z
    .object({
      owner: z
        .string()
        .optional()
        .describe("Repository owner. Falls back to GITHUB_DEFAULT_OWNER."),
      repo: z.string().describe("Repository name."),
      branch: z
        .string()
        .min(1)
        .describe(
          "Branch name (with or without `refs/heads/`) to delete on GitHub."
        )
    })
    .describe("Delete a remote branch from the GitHub repository (excluding main).");

  server.tool(
    "delete-remote-branch",
    "Delete a remote branch on GitHub (excluding main).",
    deleteRemoteBranchArgs.shape,
    async (rawArgs: unknown) => {
      const args = deleteRemoteBranchArgs.parse(rawArgs);
      const owner = args.owner ?? config.defaultOwner;

      if (!owner) {
        return toolError(
          "Provide an `owner` argument or set GITHUB_DEFAULT_OWNER."
        );
      }

      const normalized = args.branch.replace(/^refs\/heads\//, "");

      if (normalized === "main") {
        return toolError("Refusing to delete the remote main branch.");
      }

      await client.deleteBranch({
        owner,
        repo: args.repo,
        branch: normalized
      });

      return toolText(
        `Deleted remote branch '${normalized}' from ${owner}/${args.repo}.`
      );
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
      summary: z
        .string()
        .optional()
        .describe("Optional summary content. Used to build the PR body when `body` is omitted."),
      mermaid: z
        .string()
        .optional()
        .describe(
          "Optional mermaid diagram definition. Included in the body when provided and `body` is omitted."
        ),
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
        body: composePullRequestBody(args),
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

function handleGitError(error: unknown): CallToolResult {
  if (error instanceof GitLocalError) {
    const details = error.details ? `\n${error.details}` : "";
    return toolError(`${error.message}${details}`);
  }

  if (error instanceof Error) {
    return toolError(error.message);
  }

  return toolError(String(error));
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

function formatCommitStatus(status: CombinedCommitStatus): string {
  const sections: string[] = [
    `State: ${status.state}`,
    `Commit: ${status.sha}`,
    `Checks: ${status.total_count}`,
    `Commit URL: ${status.commit_url}`
  ];

  if (status.statuses.length === 0) {
    sections.push("No individual status checks reported.");
  } else {
    const formattedStatuses = status.statuses
      .map((check) => {
        const lines = [
          `Context: ${check.context}`,
          `State: ${check.state}`,
          check.description ? `Description: ${check.description}` : undefined,
          check.target_url ? `Target: ${check.target_url}` : undefined,
          `Updated: ${new Date(check.updated_at).toISOString()}`
        ];

        return lines.filter(Boolean).join("\n");
      })
      .join("\n\n");

    sections.push("Statuses:");
    sections.push(formattedStatuses);
  }

  return sections.join("\n\n");
}

function composePullRequestBody(args: {
  body?: string;
  summary?: string;
  mermaid?: string;
}): string | undefined {
  if (args.body && args.body.trim()) {
    return args.body;
  }

  const sections: string[] = [];

  if (args.summary && args.summary.trim()) {
    sections.push(`## Summary\n\n${args.summary.trim()}`);
  }

  if (args.mermaid && args.mermaid.trim()) {
    sections.push(
      [
        "## Diagram",
        "",
        "```mermaid",
        args.mermaid.trim(),
        "```"
      ].join("\n")
    );
  }

  if (sections.length === 0) {
    return undefined;
  }

  return sections.join("\n\n");
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

function formatGitReference(ref: GitReference): string {
  return [
    `Ref: ${ref.ref}`,
    `Object SHA: ${ref.object.sha}`,
    `Object type: ${ref.object.type}`,
    `URL: ${ref.url}`
  ].join("\n");
}
