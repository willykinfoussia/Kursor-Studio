import { capabilityPromptId, capabilityResourceId, capabilityToolId } from "./ids";
import type {
  MCPDiscovery,
  MCPPromptCapability,
  MCPResourceCapability,
  MCPToolAnnotations,
  MCPToolCapability,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function parseMcpTool(serverId: string, raw: unknown): MCPToolCapability | null {
  const record = asRecord(raw);
  const name = asString(record?.name);
  if (!record || !name) return null;
  const annotations = asRecord(record.annotations) as MCPToolAnnotations | null;
  return {
    id: capabilityToolId(serverId, name),
    type: "mcp-tool",
    mcpServerId: serverId,
    name,
    description: asString(record.description),
    inputSchema: record.inputSchema ?? record.input_schema ?? { type: "object", properties: {} },
    outputSchema: record.outputSchema ?? record.output_schema,
    enabled: record.enabled !== false,
    annotations: annotations ?? undefined,
  };
}

export function parseMcpResource(serverId: string, raw: unknown): MCPResourceCapability | null {
  const record = asRecord(raw);
  const uri = asString(record?.uri);
  if (!record || !uri) return null;
  return {
    id: capabilityResourceId(serverId, uri),
    type: "mcp-resource",
    mcpServerId: serverId,
    uri,
    name: asString(record.name),
    description: asString(record.description),
    mimeType: asString(record.mimeType) ?? asString(record.mime_type),
  };
}

export function parseMcpPrompt(serverId: string, raw: unknown): MCPPromptCapability | null {
  const record = asRecord(raw);
  const name = asString(record?.name);
  if (!record || !name) return null;
  const args = Array.isArray(record.arguments)
    ? record.arguments.flatMap((item) => {
      const arg = asRecord(item);
      const argName = asString(arg?.name);
      if (!arg || !argName) return [];
      return [{
        name: argName,
        description: asString(arg.description),
        required: arg.required === true,
      }];
    })
    : undefined;
  return {
    id: capabilityPromptId(serverId, name),
    type: "mcp-prompt",
    mcpServerId: serverId,
    name,
    description: asString(record.description),
    arguments: args,
  };
}

export function parseMcpDiscovery(serverId: string, raw: unknown): MCPDiscovery {
  const record = asRecord(raw);
  const tools = Array.isArray(record?.tools) ? record.tools : Array.isArray(raw) ? raw : [];
  const resources = Array.isArray(record?.resources) ? record.resources : [];
  const prompts = Array.isArray(record?.prompts) ? record.prompts : [];
  return {
    tools: tools.flatMap((item) => {
      const parsed = parseMcpTool(serverId, item);
      return parsed ? [parsed] : [];
    }),
    resources: resources.flatMap((item) => {
      const parsed = parseMcpResource(serverId, item);
      return parsed ? [parsed] : [];
    }),
    prompts: prompts.flatMap((item) => {
      const parsed = parseMcpPrompt(serverId, item);
      return parsed ? [parsed] : [];
    }),
  };
}
