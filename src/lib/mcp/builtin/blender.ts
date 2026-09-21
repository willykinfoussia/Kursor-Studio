import type { MCPServerConfig } from "../types";
import type { BuiltInConfigContext, BuiltInMCPDefinition } from "./types";

export interface BlenderSettings {
  blenderPath?: string;
  blenderVersion?: string;
  uvPath?: string;
  repoPath?: string;
  addonHost?: string;
  addonPort?: number;
}

export function blenderSettings(raw: Record<string, unknown> = {}): BlenderSettings {
  return {
    blenderPath: stringValue(raw.blenderPath),
    blenderVersion: stringValue(raw.blenderVersion),
    uvPath: stringValue(raw.uvPath),
    repoPath: stringValue(raw.repoPath),
    addonHost: stringValue(raw.addonHost) ?? "127.0.0.1",
    addonPort: numberValue(raw.addonPort) ?? 9876,
  };
}

export function buildBlenderConfig(raw: Record<string, unknown>, extras?: BuiltInConfigContext): MCPServerConfig {
  const settings = blenderSettings(raw);
  const directory = settings.repoPath ? `${settings.repoPath.replace(/[/\\]+$/, "")}/mcp` : "";
  return {
    id: "blender",
    name: "blender",
    displayName: "Blender MCP",
    enabled: extras?.enabled !== false,
    transport: "stdio",
    command: settings.uvPath || "uv",
    args: directory ? ["--directory", directory, "run", "blender-mcp"] : ["run", "blender-mcp"],
    scope: "project",
    origin: "builtin",
    trust: extras?.trusted === false ? "untrusted" : "trusted",
    projectId: extras?.projectId ?? null,
    timeoutMs: 30_000,
    metadata: {
      catalogId: "builtin.mcp.blender",
      riskLevel: "high",
      agentAccess: { coding: "full", research: "read-only" },
      settings,
    },
  };
}

export const blenderDefinition: BuiltInMCPDefinition = {
  id: "builtin.mcp.blender",
  serverId: "blender",
  name: "blender",
  displayName: "Blender MCP",
  description: "Control Blender through Model Context Protocol.",
  vendor: "Blender Lab",
  category: "3d",
  transports: ["stdio"],
  defaultScope: "project",
  riskLevel: "high",
  docsUrl: "https://www.blender.org/lab/mcp-server/",
  websiteUrl: "https://projects.blender.org/lab/blender_mcp",
  requirements: [
    { type: "application", name: "blender", required: true, minVersion: "5.1" },
    { type: "executable", name: "uv", required: true },
    { type: "directory", name: "mcp-server", required: true },
    { type: "application", name: "blender-addon", required: true },
  ],
  permissions: [
    {
      id: "execute-code",
      group: "Blender",
      action: "Execute LLM-generated Python inside Blender",
      risk: "high",
      explanation: "Blender MCP can run generated code in the open Blender session. Review every call.",
    },
  ],
  setupSteps: ["blender", "addon", "uv", "server", "permissions", "connect"],
  defaultSettings: {
    addonHost: "127.0.0.1",
    addonPort: 9876,
  },
  buildConfig: buildBlenderConfig,
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
