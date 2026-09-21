import { mcpSecretKey, secretStore, type SecretStore } from "../../agent/SecretStore";
import { builtInMcpRegistry } from "../builtin/registry";
import { parseSecretRef } from "../ids";
import { importClaudeMcpJson, validateServerConfig, type MCPConfigIssue } from "../MCPConfig";
import { MCPServerManager, mcpServerManager } from "../MCPServerManager";
import type { MCPScope, MCPServerConfig, MCPServerSnapshot } from "../types";

export interface CustomMcpPreviewServer {
  id: string;
  name: string;
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  envNames: string[];
  valid: boolean;
  errors: MCPConfigIssue[];
}

export interface CustomMcpPreview {
  servers: CustomMcpPreviewServer[];
  errors: MCPConfigIssue[];
}

export interface MissingMcpSecret {
  serverId: string;
  envName: string;
  key: string;
}

export interface CustomMcpInstallResult {
  servers: MCPServerSnapshot[];
  errors: MCPConfigIssue[];
  missingSecrets: MissingMcpSecret[];
}

export interface CustomMcpInstallOptions {
  scope?: MCPScope;
  projectId?: string | null;
}

function toPreview(config: MCPServerConfig): CustomMcpPreviewServer {
  const check = validateServerConfig(config);
  return {
    id: config.id,
    name: config.displayName ?? config.name,
    transport: config.transport,
    command: config.command,
    args: config.args,
    url: config.url,
    envNames: (config.env ?? []).map((item) => item.name),
    valid: check.valid,
    errors: check.errors,
  };
}

export class CustomMcpInstallService {
  constructor(
    private readonly manager: MCPServerManager = mcpServerManager,
    private readonly secrets: SecretStore = secretStore,
  ) {}

  preview(raw: unknown, options?: CustomMcpInstallOptions): CustomMcpPreview {
    const imported = importClaudeMcpJson(raw, {
      origin: "imported",
      scope: options?.scope ?? "global",
      projectId: options?.projectId ?? null,
    });
    return {
      servers: imported.servers.map(toPreview),
      errors: imported.errors,
    };
  }

  async install(raw: unknown, options?: CustomMcpInstallOptions): Promise<CustomMcpInstallResult> {
    const scope = options?.scope ?? "global";
    const projectId = scope === "project" ? options?.projectId ?? null : options?.projectId ?? null;
    const imported = importClaudeMcpJson(raw, { origin: "imported", scope, projectId });
    const errors: MCPConfigIssue[] = [...imported.errors];
    const servers: MCPServerSnapshot[] = [];

    for (const server of imported.servers) {
      if (builtInMcpRegistry.get(server.id)) {
        errors.push({ path: server.id, message: `Cannot overwrite built-in MCP '${server.id}'.` });
        continue;
      }
      const check = validateServerConfig(server);
      if (!check.valid) continue;
      servers.push(await this.manager.upsert({
        ...server,
        origin: "imported",
        trust: "untrusted",
        scope,
        projectId,
      }));
    }

    const missingSecrets: MissingMcpSecret[] = [];
    for (const server of servers) {
      missingSecrets.push(...await this.missingSecrets(server));
    }
    return { servers, errors, missingSecrets };
  }

  async missingSecrets(server: MCPServerConfig): Promise<MissingMcpSecret[]> {
    const missing: MissingMcpSecret[] = [];
    for (const env of server.env ?? []) {
      if (!env.secretRef) continue;
      const parsed = parseSecretRef(env.secretRef);
      const stored = await this.secrets.get(parsed.key);
      if (stored) continue;
      missing.push({
        serverId: parsed.serverId ?? server.id,
        envName: parsed.envName ?? env.name,
        key: parsed.key,
      });
    }
    return missing;
  }

  async storeSecret(serverId: string, envName: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${envName} is required.`);
    await this.secrets.set(mcpSecretKey(serverId, envName), trimmed);
  }
}

export const customMcpInstallService = new CustomMcpInstallService();
