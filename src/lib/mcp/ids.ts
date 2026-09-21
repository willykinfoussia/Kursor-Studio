const SERVER_ID = /^[a-z0-9][a-z0-9-]*$/;

export function normalizeServerId(raw: string) {
  const id = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return id;
}

export function assertServerId(id: string) {
  if (!SERVER_ID.test(id)) {
    throw new Error(`Invalid MCP server id "${id}". Use lowercase letters, digits, and dashes.`);
  }
}

export function capabilityToolId(serverId: string, toolName: string) {
  return `mcp.${serverId}.tool.${toolName}`;
}

export function capabilityResourceId(serverId: string, uri: string) {
  return `mcp.${serverId}.resource.${encodeURIComponent(uri)}`;
}

export function capabilityPromptId(serverId: string, promptName: string) {
  return `mcp.${serverId}.prompt.${promptName}`;
}

export function runtimeToolName(serverId: string, toolName: string) {
  return `mcp__${serverId}__${toolName}`;
}

export function builtinToolCapabilityId(toolName: string) {
  return `builtin.tool.${toolName}`;
}

export function parseRuntimeToolName(name: string): { serverId: string; toolName: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const split = rest.indexOf("__");
  if (split <= 0) return null;
  const serverId = rest.slice(0, split);
  const toolName = rest.slice(split + 2);
  if (!serverId || !toolName) return null;
  return { serverId, toolName };
}

export function secretKeyFor(serverId: string, envName: string) {
  return `mcp:${serverId}:${envName}`;
}

export function parseSecretRef(ref: string): { serverId?: string; envName?: string; key: string } {
  const trimmed = ref.trim();
  if (trimmed.startsWith("secret://")) {
    const path = trimmed.slice("secret://".length).replace(/^\/+/, "");
    const [serverId, envName] = path.split("/");
    if (serverId && envName) return { serverId, envName, key: secretKeyFor(serverId, envName) };
    return { key: path };
  }
  return { key: trimmed };
}
