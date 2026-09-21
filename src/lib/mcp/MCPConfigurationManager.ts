import { builtInMcpRegistry } from "./builtin/registry";
import { isSetupIncomplete, readSettings, type BuiltInMcpId } from "./builtin/types";
import type { MCPServerManager } from "./MCPServerManager";
import { mcpServerManager } from "./MCPServerManager";
import { MCPRegistry, mcpRegistry } from "./MCPRegistry";
import type { MCPServerConfig, MCPServerSnapshot } from "./types";
import { redactValue } from "./redact";
import {
  customMcpInstallService,
  type CustomMcpInstallOptions,
  type CustomMcpInstallService,
} from "./setup/CustomMcpInstallService";

export interface ConfigDiffEntry {
  path: string;
  from: string;
  to: string;
}

export class MCPConfigurationManager {
  constructor(
    private readonly manager: MCPServerManager = mcpServerManager,
    private readonly registry: MCPRegistry = mcpRegistry,
    private readonly customInstall: CustomMcpInstallService = customMcpInstallService,
  ) {}

  async list(projectId?: string | null) {
    return this.manager.list(projectId);
  }

  async load(serverId: string, projectId?: string | null) {
    const servers = await this.manager.list(projectId);
    return servers.find((item) => item.id === serverId) ?? null;
  }

  async saveBuiltin(
    catalogId: BuiltInMcpId,
    settings: Record<string, unknown>,
    extras?: { projectId?: string | null; trusted?: boolean; enabled?: boolean; setupStep?: string | null },
  ) {
    const definition = builtInMcpRegistry.get(catalogId);
    if (!definition) throw new Error(`Unknown built-in MCP ${catalogId}.`);
    const existing = await this.load(definition.serverId, extras?.projectId);
    const config = definition.buildConfig(settings, {
      projectId: extras?.projectId ?? existing?.projectId,
      trusted: extras?.trusted ?? existing?.trust === "trusted",
      enabled: extras?.enabled ?? existing?.enabled ?? true,
    });
    const metadata = {
      ...(existing?.metadata ?? {}),
      ...(config.metadata ?? {}),
      catalogId: definition.id,
      settings,
      setupStep: extras?.setupStep === null ? undefined : extras?.setupStep ?? (existing ? readSetupStepSafe(existing) : undefined),
    };
    if (extras?.setupStep === null) delete (metadata as { setupStep?: string }).setupStep;
    return this.manager.upsert({
      ...existing,
      ...config,
      metadata,
    });
  }

  diff(previous: MCPServerConfig | null, next: MCPServerConfig): ConfigDiffEntry[] {
    const entries: ConfigDiffEntry[] = [];
    const keys = ["command", "transport", "url", "enabled", "trust", "scope"] as const;
    for (const key of keys) {
      const from = stringify(previous?.[key]);
      const to = stringify(next[key]);
      if (from !== to) entries.push({ path: key, from, to });
    }
    const prevArgs = (previous?.args ?? []).join(" ");
    const nextArgs = (next.args ?? []).join(" ");
    if (prevArgs !== nextArgs) entries.push({ path: "args", from: prevArgs || "—", to: nextArgs || "—" });
    const prevSettings = readSettings(previous as MCPServerSnapshot | null);
    const nextSettings = readSettings(next as MCPServerSnapshot);
    const settingKeys = new Set([...Object.keys(prevSettings), ...Object.keys(nextSettings)]);
    for (const key of settingKeys) {
      const from = stringify(prevSettings[key]);
      const to = stringify(nextSettings[key]);
      if (from !== to) entries.push({ path: `settings.${key}`, from, to });
    }
    return entries;
  }

  redactConfig(config: MCPServerConfig) {
    return redactValue({
      command: config.command,
      args: config.args,
      url: config.url,
      env: (config.env ?? []).map((item) => ({
        name: item.name,
        value: item.secretRef ? "********" : item.value,
        secretRef: item.secretRef ? "********" : undefined,
      })),
    });
  }

  async disable(id: string) {
    const snapshot = await this.manager.disable(id);
    await this.registry.sync();
    return snapshot;
  }

  async enable(id: string) {
    const snapshot = await this.manager.enable(id);
    await this.registry.sync();
    return snapshot;
  }

  async disconnect(id: string) {
    const snapshot = await this.manager.stop(id);
    await this.registry.sync();
    return snapshot;
  }

  async reconnect(id: string) {
    const snapshot = await this.manager.restart(id);
    await this.registry.sync();
    return snapshot;
  }

  isIncomplete(snapshot: MCPServerSnapshot | null) {
    return isSetupIncomplete(snapshot);
  }

  async setToolEnabled(serverId: string, toolId: string, enabled: boolean) {
    await this.manager.setToolEnabled(serverId, toolId, enabled);
    await this.registry.sync();
  }

  async importCustom(raw: unknown, extras?: CustomMcpInstallOptions) {
    const result = await this.customInstall.install(raw, extras);
    await this.registry.sync(extras?.projectId);
    return result;
  }

  async approveTrust(id: string) {
    const existing = await this.load(id);
    if (!existing) return null;
    await this.manager.upsert({ ...existing, trust: "trusted" });
    const snapshot = await this.manager.start(id);
    await this.registry.sync();
    return snapshot;
  }

  async denyTrust(id: string) {
    const existing = await this.load(id);
    if (!existing) return null;
    const snapshot = await this.manager.upsert({ ...existing, trust: "blocked", enabled: false });
    await this.registry.sync();
    return snapshot;
  }
}

export const mcpConfigurationManager = new MCPConfigurationManager();

function stringify(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function readSetupStepSafe(snapshot: MCPServerSnapshot) {
  const metadata = snapshot.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const step = (metadata as { setupStep?: unknown }).setupStep;
  return typeof step === "string" ? step : undefined;
}
