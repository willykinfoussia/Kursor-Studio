import { parseSecretRef, normalizeServerId } from "./ids";
import type { MCPEnvironmentVariable, MCPOrigin, MCPScope, MCPServerConfig, MCPTransport, MCPTrust } from "./types";

export interface MCPConfigIssue {
  path: string;
  message: string;
}

export interface MCPConfigValidation {
  valid: boolean;
  errors: MCPConfigIssue[];
}

const SECRETISH = /(token|secret|password|api[_-]?key|authorization)/i;

export function validateServerConfig(input: Partial<MCPServerConfig> & { id?: string; name?: string }): MCPConfigValidation {
  const errors: MCPConfigIssue[] = [];
  const id = input.id ? normalizeServerId(input.id) : normalizeServerId(input.name ?? "");
  if (!id) errors.push({ path: "id", message: "Server id is required." });
  if (!input.name?.trim() && !id) errors.push({ path: "name", message: "Server name is required." });

  const transport = input.transport ?? "stdio";
  if (transport !== "stdio" && transport !== "sse" && transport !== "streamable-http") {
    errors.push({ path: "transport", message: "Transport must be stdio, sse, or streamable-http." });
  }
  if (transport === "stdio") {
    if (!input.command?.trim()) errors.push({ path: "command", message: "stdio servers require a command." });
    if (input.url?.trim()) errors.push({ path: "url", message: "stdio servers must not set url." });
  } else if (!input.url?.trim()) {
    errors.push({ path: "url", message: "Network transports require a url." });
  }
  if (transport === "sse") {
    errors.push({ path: "transport", message: "Legacy SSE is not started. Use stdio or streamable-http." });
  }

  for (const [index, env] of (input.env ?? []).entries()) {
    const issue = validateEnvVar(env, index);
    if (issue) errors.push(issue);
  }

  return { valid: errors.length === 0, errors };
}

function validateEnvVar(env: MCPEnvironmentVariable, index: number): MCPConfigIssue | null {
  if (!env.name?.trim()) return { path: `env.${index}.name`, message: "Environment variable name is required." };
  if (env.value && SECRETISH.test(env.name) && !env.secretRef) {
    return { path: `env.${index}.value`, message: `Refusing to store ${env.name} in plaintext. Use secretRef.` };
  }
  if (env.secretRef) {
    const parsed = parseSecretRef(env.secretRef);
    if (!parsed.key) return { path: `env.${index}.secretRef`, message: "secretRef is empty." };
  }
  if (env.value && looksLikeSecretValue(env.value)) {
    return { path: `env.${index}.value`, message: "Looks like a secret value. Store it in SecretStore and reference it." };
  }
  return null;
}

function looksLikeSecretValue(value: string) {
  return /^(ghp_|github_pat_|sk-|xox[baprs]-)/.test(value.trim());
}

export function normalizeServerConfig(input: Partial<MCPServerConfig> & { name: string }): MCPServerConfig {
  const id = normalizeServerId(input.id ?? input.name);
  return {
    id,
    name: input.name.trim() || id,
    displayName: input.displayName?.trim() || input.name.trim() || id,
    enabled: input.enabled !== false,
    transport: (input.transport ?? "stdio") as MCPTransport,
    command: input.command?.trim() || undefined,
    args: input.args ?? [],
    url: input.url?.trim() || undefined,
    env: (input.env ?? []).map((item) => ({
      name: item.name.trim(),
      value: item.secretRef ? undefined : item.value,
      secretRef: item.secretRef,
      required: item.required !== false,
    })),
    scope: (input.scope ?? "global") as MCPScope,
    origin: (input.origin ?? "user") as MCPOrigin,
    trust: (input.trust ?? "untrusted") as MCPTrust,
    version: input.version,
    timeoutMs: input.timeoutMs,
    projectId: input.projectId ?? null,
    metadata: input.metadata,
  };
}

interface ClaudeMcpServerEntry {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
}

export function importClaudeMcpJson(raw: unknown, defaults?: { scope?: MCPScope; origin?: MCPOrigin; projectId?: string | null }): {
  servers: MCPServerConfig[];
  errors: MCPConfigIssue[];
} {
  const errors: MCPConfigIssue[] = [];
  const root = asRecord(raw);
  if (!root) return { servers: [], errors: [{ path: "", message: "MCP config must be an object." }] };
  const map = asRecord(root.mcpServers) ?? asRecord(root.servers);
  if (!map) return { servers: [], errors: [{ path: "mcpServers", message: "Missing mcpServers or servers object." }] };

  const servers: MCPServerConfig[] = [];
  for (const [key, value] of Object.entries(map)) {
    const entry = asRecord(value) as ClaudeMcpServerEntry | null;
    if (!entry) {
      errors.push({ path: key, message: "Server entry must be an object." });
      continue;
    }
    const transport = inferTransport(entry);
    const env = Object.entries(entry.env ?? {}).map(([name, envValue]) => envFromImport(key, name, envValue));
    const config = normalizeServerConfig({
      id: key,
      name: key,
      command: entry.command,
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
      url: entry.url,
      transport,
      enabled: entry.disabled !== true,
      env,
      scope: defaults?.scope ?? "global",
      origin: defaults?.origin ?? "imported",
      projectId: defaults?.projectId ?? null,
    });
    const check = validateServerConfig(config);
    if (!check.valid) errors.push(...check.errors.map((item) => ({ ...item, path: `${key}.${item.path}` })));
    servers.push(config);
  }
  return { servers, errors };
}

function envFromImport(serverId: string, name: string, value: string): MCPEnvironmentVariable {
  const interpolated = value.trim();
  const envMatch = interpolated.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (envMatch || SECRETISH.test(name) || interpolated.startsWith("secret://")) {
    return {
      name,
      required: true,
      secretRef: interpolated.startsWith("secret://")
        ? interpolated
        : `secret://${serverId}/${envMatch?.[1] ?? name}`,
    };
  }
  return { name, value: interpolated, required: false };
}

function inferTransport(entry: ClaudeMcpServerEntry): MCPTransport {
  const type = (entry.type ?? "").toLowerCase();
  if (type === "sse") return "sse";
  if (type === "http" || type === "streamable-http" || type === "streamable_http") return "streamable-http";
  if (entry.url && !entry.command) return "streamable-http";
  return "stdio";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
