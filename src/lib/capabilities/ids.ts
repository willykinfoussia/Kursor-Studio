import {
  builtinToolCapabilityId,
  capabilityPromptId,
  capabilityResourceId,
  capabilityToolId,
  parseRuntimeToolName,
} from "../mcp/ids";

export {
  builtinToolCapabilityId,
  capabilityPromptId,
  capabilityResourceId,
  capabilityToolId,
  parseRuntimeToolName,
};

export type SkillIdOrigin = "builtin" | "project" | "user";

export function skillOriginNamespace(origin: "builtin" | "project" | "global" | "user"): SkillIdOrigin {
  return origin === "global" ? "user" : origin;
}

export function skillCapabilityId(origin: "builtin" | "project" | "global" | "user", rawId: string) {
  const trimmed = rawId.replace(/^skill:/, "");
  const parsed = parseSkillCapabilityId(trimmed);
  if (parsed) return `${parsed.origin}.skill.${parsed.skillId}`;
  return `${skillOriginNamespace(origin)}.skill.${trimmed}`;
}

export function parseSkillCapabilityId(id: string): { origin: SkillIdOrigin; skillId: string } | null {
  const match = /^(builtin|project|user)\.skill\.(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) return null;
  return { origin: match[1] as SkillIdOrigin, skillId: match[2] };
}

export function mcpServerCapabilityId(serverId: string) {
  return `mcp.${serverId}`;
}

export function parseMcpServerCapabilityId(id: string) {
  const match = /^mcp\.([a-z0-9][a-z0-9-]*)$/.exec(id);
  return match?.[1] ?? null;
}

export function parseMcpToolCapabilityId(id: string): { serverId: string; toolName: string } | null {
  const match = /^mcp\.([a-z0-9][a-z0-9-]*)\.tool\.(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

export function parseMcpResourceCapabilityId(id: string): { serverId: string; uri: string } | null {
  const match = /^mcp\.([a-z0-9][a-z0-9-]*)\.resource\.(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) return null;
  try {
    return { serverId: match[1], uri: decodeURIComponent(match[2]) };
  } catch {
    return { serverId: match[1], uri: match[2] };
  }
}

export function parseMcpPromptCapabilityId(id: string): { serverId: string; promptName: string } | null {
  const match = /^mcp\.([a-z0-9][a-z0-9-]*)\.prompt\.(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) return null;
  return { serverId: match[1], promptName: match[2] };
}

export function capabilityIdFromRuntimeTool(name: string) {
  const parsed = parseRuntimeToolName(name);
  if (parsed) return capabilityToolId(parsed.serverId, parsed.toolName);
  return builtinToolCapabilityId(name);
}

export function rawSkillId(id: string) {
  return parseSkillCapabilityId(id)?.skillId ?? id.replace(/^skill:/, "");
}
