import { REPORT_TRAILER, type AgentDefinition } from "./types";
import {
  EXPLORE_MAX_DURATION_MS,
  IMPLEMENT_MAX_DURATION_MS,
  REVIEW_MAX_DURATION_MS,
} from "../config";

const READ_TOOLS = ["list_files", "read_file", "search_files", "load_skill", "check_skills"] as const;
const GIT_READ_TOOLS = ["git_status", "git_diff"] as const;
const GIT_WRITE_TOOLS = ["git_commit", "git_push", "git_pull", "git_fetch"] as const;
const WEB_TOOLS = ["web_search", "fetch_url"] as const;
const WRITE_TOOLS = [
  "write_file",
  "create_file",
  "delete_file",
  "apply_patch",
  "create_directory",
] as const;

export const EXPLORE_AGENT: AgentDefinition = {
  id: "explore",
  name: "Explore",
  instructions: `You are Kursor's explore subagent.
Inspect the repo. Read-only: never create, edit, or delete files. Never run mutating commands.
Return a concise summary and findings for the parent. Do not load using-superpowers.
${REPORT_TRAILER}`,
  tools: [...READ_TOOLS, ...WEB_TOOLS, ...GIT_READ_TOOLS, "mcp__*"],
  permissionMode: "read-only",
  maxSteps: 12,
  maxDurationMs: EXPLORE_MAX_DURATION_MS,
  contextPolicy: "isolated",
};

export const IMPLEMENT_AGENT: AgentDefinition = {
  id: "implement",
  name: "Implement",
  instructions: `You are Kursor's implementer subagent.
Follow test-driven-development: failing test, then minimal code, then pass.
Prefer apply_patch for edits. Commit with git_commit and publish with git_push when the task asks.
Do not start or kill long-running processes. Do not load using-superpowers.
${REPORT_TRAILER}`,
  tools: [
    ...READ_TOOLS,
    ...WRITE_TOOLS,
    ...GIT_READ_TOOLS,
    ...GIT_WRITE_TOOLS,
    "run_command",
    "mcp__*",
  ],
  permissionMode: "workspace-write",
  maxSteps: 24,
  maxDurationMs: IMPLEMENT_MAX_DURATION_MS,
  contextPolicy: "isolated",
};

export const REVIEW_AGENT: AgentDefinition = {
  id: "review",
  name: "Review",
  instructions: `You are Kursor's reviewer subagent.
Read the diff and changed files. Report issues by severity. Critical findings must be listed first.
Do not edit files. Do not load using-superpowers.
${REPORT_TRAILER}`,
  tools: [...READ_TOOLS, ...GIT_READ_TOOLS],
  permissionMode: "read-only",
  maxSteps: 8,
  maxDurationMs: REVIEW_MAX_DURATION_MS,
  contextPolicy: "isolated",
};

/** @deprecated Use EXPLORE_AGENT */
export const RESEARCH_AGENT = EXPLORE_AGENT;
/** @deprecated Use IMPLEMENT_AGENT */
export const CODING_AGENT = IMPLEMENT_AGENT;
/** @deprecated Use IMPLEMENT_AGENT */
export const TESTING_AGENT = IMPLEMENT_AGENT;

export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  EXPLORE_AGENT,
  IMPLEMENT_AGENT,
  REVIEW_AGENT,
];
