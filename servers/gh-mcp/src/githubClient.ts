export interface ListRepositoriesOptions {
  owner?: string;
  ownerType?: "user" | "org";
  perPage?: number;
  includePrivate?: boolean;
}

export interface RepositorySummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  pushed_at: string | null;
  visibility?: string;
  stargazers_count: number;
  open_issues_count: number;
  language: string | null;
}

export interface IssueSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  labels: Array<{ name?: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  body?: string | null;
}

export interface SearchIssuesOptions {
  query: string;
  perPage?: number;
}

export interface CreatePullRequestParams {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
}

export interface PullRequestSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft?: boolean;
  user: {
    login: string;
  };
  base: {
    ref: string;
    repo: {
      full_name: string;
    };
  };
  head: {
    label: string;
    ref: string;
  };
  body?: string | null;
}

export interface ApprovePullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
  body?: string;
}

export interface PullRequestReview {
  id: number;
  state: string;
  body: string | null;
  submitted_at: string;
  user: {
    login: string;
  };
  html_url: string;
}

export interface MergePullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
  expectedHeadSha?: string;
}

export interface MergeResult {
  merged: boolean;
  message: string;
  sha?: string;
  merged_by?: {
    login: string;
  };
}

export interface GitReference {
  ref: string;
  node_id?: string;
  url: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
}

export interface CommitStatusCheck {
  id: number;
  state: string;
  description: string | null;
  context: string;
  target_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CombinedCommitStatus {
  state: string;
  sha: string;
  total_count: number;
  statuses: CommitStatusCheck[];
  commit_url: string;
  url: string;
}

export interface CreateBranchParams {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
}

export interface UpdateBranchParams {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
  force?: boolean;
}

export interface DeleteBranchParams {
  owner: string;
  repo: string;
  branch: string;
}

export interface GetCommitStatusParams {
  owner: string;
  repo: string;
  ref: string;
}

export interface RateLimitInfo {
  core: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
  search: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
  graphql?: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
  integrationManifest?: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
}

export class GitHubClient {
  private readonly baseUrl = "https://api.github.com";

  constructor(
    private readonly token: string,
    private readonly userAgent: string
  ) {
    if (!token) {
      throw new Error("GitHub token is required");
    }
  }

  async listRepositories(
    options: ListRepositoriesOptions = {}
  ): Promise<RepositorySummary[]> {
    const { owner, ownerType = "user", perPage = 30, includePrivate = false } =
      options;

    const searchParams = new URLSearchParams({
      per_page: Math.max(1, Math.min(perPage, 100)).toString(),
      sort: "pushed"
    });

    if (includePrivate) {
      searchParams.set("visibility", "all");
    }

    let path: string;

    if (owner) {
      if (ownerType === "org") {
        path = `/orgs/${owner}/repos`;
      } else {
        path = `/users/${owner}/repos`;
      }
    } else {
      path = "/user/repos";
    }

    return this.request<RepositorySummary[]>(path, { searchParams });
  }

  async getIssue(params: {
    owner: string;
    repo: string;
    issueNumber: number;
  }): Promise<IssueSummary> {
    const { owner, repo, issueNumber } = params;
    return this.request<IssueSummary>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`
    );
  }

  async searchIssues(
    options: SearchIssuesOptions
  ): Promise<{ totalCount: number; items: IssueSummary[] }> {
    const { query, perPage = 10 } = options;
    const params = new URLSearchParams({
      q: query,
      per_page: Math.max(1, Math.min(perPage, 100)).toString()
    });

    const result = await this.request<{
      total_count: number;
      items: IssueSummary[];
    }>("/search/issues", { searchParams: params });

    return {
      totalCount: result.total_count,
      items: result.items
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    const { resources } = await this.request<{ resources: RateLimitInfo }>(
      "/rate_limit"
    );
    return resources;
  }

  async createPullRequest(
    params: CreatePullRequestParams
  ): Promise<PullRequestSummary> {
    const { owner, repo } = params;
    return this.request<PullRequestSummary>(
      `/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        body: {
          title: params.title,
          head: params.head,
          base: params.base,
          body: params.body,
          draft: params.draft,
          maintainer_can_modify: params.maintainerCanModify
        }
      }
    );
  }

  async approvePullRequest(
    params: ApprovePullRequestParams
  ): Promise<PullRequestReview> {
    const { owner, repo, pullNumber, body } = params;
    return this.request<PullRequestReview>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      {
        method: "POST",
        body: {
          event: "APPROVE",
          body
        }
      }
    );
  }

  async mergePullRequest(
    params: MergePullRequestParams
  ): Promise<MergeResult> {
    const { owner, repo, pullNumber, ...body } = params;
    return this.request<MergeResult>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: "PUT",
        body: {
          commit_title: body.commitTitle,
          commit_message: body.commitMessage,
          merge_method: body.mergeMethod,
          sha: body.expectedHeadSha
        }
      }
    );
  }

  async createBranch(params: CreateBranchParams): Promise<GitReference> {
    const { owner, repo, branch, sha } = params;
    const ref = branch.startsWith("refs/")
      ? branch
      : `refs/heads/${branch}`;

    return this.request<GitReference>(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: {
        ref,
        sha
      }
    });
  }

  async updateBranch(params: UpdateBranchParams): Promise<GitReference> {
    const { owner, repo, sha, force = false } = params;
    const normalizedBranch = params.branch.replace(/^refs\/heads\//, "");
    const branchPath = normalizedBranch
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return this.request<GitReference>(
      `/repos/${owner}/${repo}/git/refs/heads/${branchPath}`,
      {
        method: "PATCH",
        body: {
          sha,
          force
        }
      }
    );
  }

  async deleteBranch(params: DeleteBranchParams): Promise<void> {
    const { owner, repo } = params;
    const normalized = params.branch.replace(/^refs\/heads\//, "");
    const branchPath = normalized
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    await this.request<void>(
      `/repos/${owner}/${repo}/git/refs/heads/${branchPath}`,
      {
        method: "DELETE"
      }
    );
  }

  async getCommitStatus(
    params: GetCommitStatusParams
  ): Promise<CombinedCommitStatus> {
    const { owner, repo, ref } = params;
    return this.request<CombinedCommitStatus>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status`
    );
  }

  private async request<T>(
    path: string,
    options: {
      searchParams?: URLSearchParams;
      method?: string;
      body?: unknown;
    } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options.searchParams) {
      url.search = options.searchParams.toString();
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "User-Agent": this.userAgent
    };

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async handleError(response: globalThis.Response): Promise<never> {
    let message = `GitHub API request failed with ${response.status}`;

    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) {
        message = `${message}: ${data.message}`;
      }
    } catch {
      // Ignore JSON parse errors for text responses.
    }

    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");

    if (remaining === "0" && reset) {
      const resetDate = new Date(Number.parseInt(reset, 10) * 1000);
      message = `${message}. Rate limit resets at ${resetDate.toISOString()}.`;
    }

    throw new Error(message);
  }
}
