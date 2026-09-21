import type { MCPServerConfig } from "../types";
import type { BuiltInConfigContext, BuiltInMCPDefinition } from "./types";

export const GITHUB_DEFAULT_TOOLSETS = ["context", "repos", "issues", "pull_requests", "users"] as const;
export const GITHUB_ADVANCED_TOOLSETS = ["actions", "code_security", "discussions", "gists", "dependabot"] as const;
export const GITHUB_IMAGE = "ghcr.io/github/github-mcp-server";

export type GitHubAccess = "read-only" | "standard" | "advanced";

export interface GitHubSettings {
  access: GitHubAccess;
  readOnly: boolean;
  toolsets: string[];
  discoveredToolsets?: string[];
}

export function githubSettings(raw: Record<string, unknown> = {}): GitHubSettings {
  const access = raw.access === "read-only" || raw.access === "advanced" ? raw.access : "standard";
  const toolsets = Array.isArray(raw.toolsets)
    ? raw.toolsets.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [...GITHUB_DEFAULT_TOOLSETS];
  const discovered = Array.isArray(raw.discoveredToolsets)
    ? raw.discoveredToolsets.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    access,
    readOnly: raw.readOnly === true || access === "read-only",
    toolsets: toolsets.length ? toolsets : [...GITHUB_DEFAULT_TOOLSETS],
    discoveredToolsets: discovered,
  };
}

export function availableGitHubToolsets(settings: GitHubSettings) {
  if (settings.discoveredToolsets && settings.discoveredToolsets.length > 0) {
    return settings.discoveredToolsets;
  }
  return [...GITHUB_DEFAULT_TOOLSETS, ...GITHUB_ADVANCED_TOOLSETS];
}

export function buildGitHubConfig(raw: Record<string, unknown>, extras?: BuiltInConfigContext): MCPServerConfig {
  const settings = githubSettings(raw);
  const env = [
    { name: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef: "secret://github/GITHUB_PERSONAL_ACCESS_TOKEN", required: true },
    { name: "GITHUB_TOOLSETS", value: settings.toolsets.join(","), required: false },
  ];
  if (settings.readOnly) {
    env.push({ name: "GITHUB_READ_ONLY", value: "1", required: false });
  }
  return {
    id: "github",
    name: "github",
    displayName: "GitHub MCP",
    enabled: extras?.enabled !== false,
    transport: "stdio",
    command: "docker",
    args: [
      "run", "-i", "--rm",
      "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
      "-e", "GITHUB_TOOLSETS",
      ...(settings.readOnly ? ["-e", "GITHUB_READ_ONLY"] : []),
      GITHUB_IMAGE,
    ],
    env,
    scope: "global",
    origin: "builtin",
    trust: extras?.trusted === false ? "untrusted" : "trusted",
    projectId: extras?.projectId ?? null,
    timeoutMs: 30_000,
    metadata: {
      catalogId: "builtin.mcp.github",
      agentAccess: { coding: "full", research: "read-only" },
      settings,
    },
  };
}

export const githubDefinition: BuiltInMCPDefinition = {
  id: "builtin.mcp.github",
  serverId: "github",
  name: "github",
  displayName: "GitHub MCP",
  description: "Official GitHub MCP server with configurable toolsets and read-only mode.",
  vendor: "GitHub",
  category: "developer",
  transports: ["stdio"],
  defaultScope: "global",
  riskLevel: "high",
  docsUrl: "https://github.com/github/github-mcp-server",
  websiteUrl: "https://github.com/github/github-mcp-server",
  requirements: [
    { type: "credential", name: "github-account", required: true },
    { type: "executable", name: "docker", required: true },
  ],
  permissions: [
    {
      id: "github-api",
      group: "Network",
      action: "Call GitHub APIs with the connected account",
      risk: "high",
      explanation: "Uses the existing Kursor GitHub token. Advanced toolsets may need extra scopes.",
    },
  ],
  setupSteps: ["account", "access", "toolsets", "permissions", "connect"],
  defaultSettings: {
    access: "standard",
    readOnly: false,
    toolsets: [...GITHUB_DEFAULT_TOOLSETS],
  },
  buildConfig: buildGitHubConfig,
};
