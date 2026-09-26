import { toolPermission } from "../permissions/meta";
import type { AgentTool, ToolResult } from "../ToolRegistry";
import type { AgentGitService } from "./native";
import { failResult, okResult, toToolFailure } from "./result";
import { asRecord, toolSchema } from "./schema";
import { isFailure, optionalRelativeDirectory, requireProjectRoot, requiredRelativePath } from "./paths";
import { ensureBranchForPush } from "./gitBranch";

function optionalPaths(input: unknown, projectRoot: string): string[] | ToolResult {
  const raw = asRecord(input).paths;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return failResult("invalid_input", "paths must be an array of relative files.");
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return failResult("invalid_input", "paths must be an array of relative files.");
    const parsed = requiredRelativePath({ path: item }, "path", projectRoot);
    if (isFailure(parsed)) return parsed;
    paths.push(parsed);
  }
  return paths;
}

export function createGitStatusTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_status",
    description: "Read git status for the open project (branch and changed files).",
    ...toolPermission("git.read", "low"),
    timeoutMs: 15_000,
    mutate: false,
    parameters: toolSchema({}),
    async execute(_input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      try {
        const status = await deps.git.status();
        return okResult(status);
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createGitDiffTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_diff",
    description: "Read a git diff for the open project. Optional path is relative to the project root.",
    ...toolPermission("git.read", "low"),
    timeoutMs: 15_000,
    mutate: false,
    parameters: toolSchema({
      path: { type: "string", description: "Optional file or directory relative to the project root" },
    }),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = optionalRelativeDirectory(input, "path", root);
      if (isFailure(path)) return path;
      try {
        const diff = await deps.git.diff(path || undefined);
        return okResult({ path: path || null, diff: diff.diff });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createGitCommitTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_commit",
    description: "Stage and commit project files with a message. Optional push publishes to origin using the GitHub token.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 60_000,
    mutate: true,
    parameters: toolSchema({
      message: { type: "string", description: "Commit message" },
      paths: { type: "array", items: { type: "string" }, description: "Optional relative files to stage. Defaults to all changes." },
      push: { type: "boolean", description: "If true, push to origin after the commit" },
    }, ["message"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const message = String(asRecord(input).message ?? "").trim();
      if (!message) return failResult("invalid_input", "Commit message is required.");
      const paths = optionalPaths(input, root);
      if (isFailure(paths)) return paths;
      const push = asRecord(input).push === true;
      try {
        if (push) {
          const branch = asRecord(input).branch;
          const preferred = typeof branch === "string" ? branch : ctx.harness?.workflow.agentBranch?.name;
          await ensureBranchForPush(deps.git, preferred);
        }
        const result = await deps.git.commit({ message, paths, push });
        return okResult(result);
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createGitPushTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_push",
    description: "Push the current branch to origin using the connected GitHub token. If HEAD is detached, pass branch to create/checkout it first.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 60_000,
    mutate: true,
    parameters: toolSchema({
      branch: { type: "string", description: "If HEAD is detached, create or checkout this branch before pushing" },
    }),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const branch = asRecord(input).branch;
      const preferred = typeof branch === "string" ? branch : ctx.harness?.workflow.agentBranch?.name;
      try {
        const created = await ensureBranchForPush(deps.git, preferred);
        await deps.git.push();
        return okResult({ pushed: true, branch: created });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createGitPullTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_pull",
    description: "Pull origin into the current branch using the connected GitHub token.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 60_000,
    mutate: true,
    parameters: toolSchema({}),
    async execute(_input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      try {
        await deps.git.pull();
        return okResult({ pulled: true });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createGitFetchTool(deps: { git: AgentGitService }): AgentTool {
  return {
    name: "git_fetch",
    description: "Fetch remotes using the connected GitHub token.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 60_000,
    mutate: true,
    parameters: toolSchema({}),
    async execute(_input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      try {
        await deps.git.fetch();
        return okResult({ fetched: true });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
