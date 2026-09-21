import type { MCPServerConfig } from "../types";
import type { BuiltInConfigContext, BuiltInMCPDefinition } from "./types";

export const COMPOSIO_API_KEY_REF = "secret://composio/COMPOSIO_API_KEY";
export const COMPOSIO_DEFAULT_URL = "https://backend.composio.dev/v3/mcp";

export interface ComposioSettings {
  mcpUrl?: string;
  userId?: string;
  enabledToolkits: string[];
  enabledTools: string[];
}

export function composioSettings(raw: Record<string, unknown> = {}): ComposioSettings {
  return {
    mcpUrl: stringValue(raw.mcpUrl) ?? COMPOSIO_DEFAULT_URL,
    userId: stringValue(raw.userId),
    enabledToolkits: stringArray(raw.enabledToolkits),
    enabledTools: stringArray(raw.enabledTools),
  };
}

export function buildComposioConfig(raw: Record<string, unknown>, extras?: BuiltInConfigContext): MCPServerConfig {
  const settings = composioSettings(raw);
  return {
    id: "composio",
    name: "composio",
    displayName: "Composio MCP",
    enabled: extras?.enabled !== false,
    transport: "streamable-http",
    url: settings.mcpUrl,
    env: [
      { name: "x-api-key", secretRef: COMPOSIO_API_KEY_REF, required: true },
    ],
    scope: "global",
    origin: "builtin",
    trust: extras?.trusted === false ? "untrusted" : "trusted",
    projectId: extras?.projectId ?? null,
    timeoutMs: 30_000,
    metadata: {
      catalogId: "builtin.mcp.composio",
      agentAccess: { coding: "full", research: "read-only" },
      settings,
    },
  };
}

export const composioDefinition: BuiltInMCPDefinition = {
  id: "builtin.mcp.composio",
  serverId: "composio",
  name: "composio",
  displayName: "Composio MCP",
  description: "Connect external apps and toolkits through Composio.",
  vendor: "Composio",
  category: "automation",
  transports: ["streamable-http"],
  defaultScope: "global",
  riskLevel: "high",
  docsUrl: "https://docs.composio.dev/docs/sessions-via-mcp",
  websiteUrl: "https://composio.dev",
  requirements: [
    { type: "credential", name: "api-key", required: true },
  ],
  permissions: [
    { id: "network", group: "Network", action: "Reach Composio and connected apps", risk: "high", explanation: "Requires outbound network access." },
    { id: "external", group: "External services", action: "Call third-party APIs", risk: "high", explanation: "Toolkits talk to Slack, Gmail, Notion, and others." },
    { id: "credentials", group: "Credentials", action: "Use stored Composio API key", risk: "high", explanation: "The key stays in SecretStore and is injected only when trusted." },
    { id: "high-risk", group: "High-risk actions", action: "Ask before execution", risk: "high", explanation: "Sensitive tools go through PermissionManager." },
  ],
  setupSteps: ["credential", "toolkits", "tools", "permissions", "connect"],
  defaultSettings: {
    mcpUrl: COMPOSIO_DEFAULT_URL,
    enabledToolkits: [],
    enabledTools: [],
  },
  buildConfig: buildComposioConfig,
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
