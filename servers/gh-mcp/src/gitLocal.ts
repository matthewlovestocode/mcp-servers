import { access } from "fs/promises";
import { constants } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export class GitLocalError extends Error {
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = "GitLocalError";
  }
}

async function ensureRepoPath(repoPath: string): Promise<string> {
  if (!repoPath) {
    throw new GitLocalError("Repository path is required for local git commands.");
  }

  const resolved = resolve(repoPath);

  try {
    await access(resolved, constants.F_OK);
  } catch (error) {
    throw new GitLocalError(
      `Repository path does not exist: ${resolved}`,
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    await access(join(resolved, ".git"), constants.F_OK);
  } catch (error) {
    throw new GitLocalError(
      `Path is not a git repository (missing .git directory): ${resolved}`,
      error instanceof Error ? error.message : String(error)
    );
  }

  return resolved;
}

async function runGitCommand(
  repoPath: string,
  args: string[]
): Promise<GitCommandResult> {
  const cwd = await ensureRepoPath(repoPath);

  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(
        new GitLocalError(
          `Failed to execute git command: git ${args.join(" ")}`,
          error instanceof Error ? error.message : String(error)
        )
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new GitLocalError(
            `git ${args.join(" ")} exited with code ${code}`,
            stderr.trim() || undefined
          )
        );
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

export async function createLocalBranch(options: {
  repoPath: string;
  branch: string;
  startPoint?: string;
}): Promise<GitCommandResult> {
  const args = ["checkout", "-b", options.branch];
  if (options.startPoint) {
    args.push(options.startPoint);
  }

  return runGitCommand(options.repoPath, args);
}

export async function getStatus(options: {
  repoPath: string;
}): Promise<GitCommandResult> {
  return runGitCommand(options.repoPath, ["status", "--short", "--branch"]);
}

export async function stageChanges(options: {
  repoPath: string;
  paths?: string[];
}): Promise<GitCommandResult> {
  const paths = options.paths?.length ? options.paths : ["."];
  return runGitCommand(options.repoPath, ["add", "--", ...paths]);
}

export async function createCommit(options: {
  repoPath: string;
  message: string;
  allowEmpty?: boolean;
  signoff?: boolean;
}): Promise<GitCommandResult> {
  const args = ["commit", "-m", options.message];

  if (options.allowEmpty) {
    args.push("--allow-empty");
  }

  if (options.signoff) {
    args.push("--signoff");
  }

  return runGitCommand(options.repoPath, args);
}

export async function deleteLocalBranch(options: {
  repoPath: string;
  branch: string;
  force?: boolean;
}): Promise<GitCommandResult> {
  const normalized = options.branch.trim();

  if (!normalized) {
    throw new GitLocalError("Branch name is required to delete a local branch.");
  }

  if (normalized === "main") {
    throw new GitLocalError("Refusing to delete the main branch locally.");
  }

  const args = ["branch", options.force ? "-D" : "-d", normalized];
  return runGitCommand(options.repoPath, args);
}
