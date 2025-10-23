import { config as loadEnv } from "dotenv";

loadEnv();

export interface GitHubServerConfig {
  token: string;
  userAgent: string;
  defaultOwner?: string;
}

export function resolveConfig(): GitHubServerConfig {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (!token) {
    throw new Error(
      "Missing GitHub token. Set the GITHUB_TOKEN environment variable."
    );
  }

  const defaultOwner = process.env.GITHUB_DEFAULT_OWNER;
  const userAgent =
    process.env.GITHUB_USER_AGENT ??
    "gh-mcp-server/0.1 (+https://github.com)";

  return {
    token,
    userAgent,
    defaultOwner
  };
}
