import type { MCPServerConfig } from "../mcp/types";

export const CODEGRAPH_ID = "codegraph";
export const GRAPHIFY_ID = "graphify";
export const CODEGRAPH_INSTALL = "npm install -g @colbymchenry/codegraph";
export const GRAPHIFY_INSTALL = "uv tool install graphifyy";
export const INSTALLING_DETAIL = "Installing CodeGraph and Graphify…";
export const INDEX_TIMEOUT_MS = 10 * 60 * 1000;

export const CODE_INTEL_GUIDANCE = `When CodeGraph is connected, call mcp__codegraph__codegraph_explore before grepping for how a symbol works, who calls it, or the impact of a change. Treat the source it returns as already read.
When Graphify is connected, call mcp__graphify__query_graph or mcp__graphify__get_node for architecture, documentation, and how concepts connect.`;

export function shellQuote(value: string): string {
  if (value.length === 0) return "\"\"";
  if (/[\s"]/.test(value)) return `"${value.replace(/"/g, "\\\"")}"`;
  return value;
}

export function commandLine(program: string, args: string[]): string {
  return [program, ...args].map(shellQuote).join(" ");
}

function env(name: string, value: string) {
  return { name, value, required: false as const };
}

export function codegraphServer(command: string, projectId: string): MCPServerConfig {
  return {
    id: CODEGRAPH_ID,
    name: CODEGRAPH_ID,
    displayName: "CodeGraph",
    enabled: true,
    transport: "stdio",
    command,
    args: ["serve", "--mcp"],
    env: [
      env("CODEGRAPH_MCP_TOOLS", "explore,search,callers,callees,impact,status"),
      env("CODEGRAPH_TELEMETRY", "off"),
    ],
    scope: "project",
    origin: "project",
    trust: "trusted",
    projectId,
    timeoutMs: 60_000,
  };
}

export function graphifyServer(command: string, projectId: string): MCPServerConfig {
  return {
    id: GRAPHIFY_ID,
    name: GRAPHIFY_ID,
    displayName: "Graphify",
    enabled: true,
    transport: "stdio",
    command,
    args: [".", "--mcp"],
    env: [env("GRAPHIFY_QUERY_LOG_DISABLE", "1")],
    scope: "project",
    origin: "project",
    trust: "trusted",
    projectId,
    timeoutMs: 60_000,
  };
}
