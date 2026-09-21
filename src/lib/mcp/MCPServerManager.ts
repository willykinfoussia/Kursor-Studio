import { importClaudeMcpJson, normalizeServerConfig, validateServerConfig } from "./MCPConfig";
import type { MCPRuntime } from "./MCPRuntime";
import { mcpRuntime } from "./MCPRuntime";
import type { MCPServerConfig, MCPServerSnapshot } from "./types";

export class MCPServerManager {
  constructor(private readonly runtime: MCPRuntime = mcpRuntime) {}

  list(projectId?: string | null) {
    return this.runtime.list(projectId);
  }

  async upsert(input: MCPServerConfig) {
    const config = normalizeServerConfig(input);
    const check = validateServerConfig(config);
    if (!check.valid) {
      throw new Error(check.errors.map((item) => item.message).join(" "));
    }
    return this.runtime.upsert(config);
  }

  remove(id: string) {
    return this.runtime.remove(id);
  }

  enable(id: string) {
    return this.runtime.enable(id, true);
  }

  disable(id: string) {
    return this.runtime.enable(id, false);
  }

  start(id: string) {
    return this.runtime.start(id);
  }

  stop(id: string) {
    return this.runtime.stop(id);
  }

  restart(id: string) {
    return this.runtime.restart(id);
  }

  setToolEnabled(id: string, toolId: string, enabled: boolean) {
    return this.runtime.setToolEnabled(id, toolId, enabled);
  }

  async importJson(raw: unknown, defaults?: { scope?: MCPServerConfig["scope"]; origin?: MCPServerConfig["origin"]; projectId?: string | null }) {
    const imported = importClaudeMcpJson(raw, defaults);
    const servers: MCPServerSnapshot[] = [];
    for (const server of imported.servers) {
      const check = validateServerConfig(server);
      if (!check.valid) continue;
      servers.push(await this.runtime.upsert(server));
    }
    return { servers, errors: imported.errors };
  }
}

export const mcpServerManager = new MCPServerManager();
