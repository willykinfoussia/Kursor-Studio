import { builtinToolCapabilityId } from "../mcp/ids";
import { isMcpRuntimeName } from "../mcp/types";
import type { MCPRegistry } from "../mcp/MCPRegistry";
import { mcpRegistry } from "../mcp/MCPRegistry";
import { builtInMcpRegistry } from "../mcp/builtin/registry";
import { lifecycleFromSnapshot, isSetupIncomplete } from "../mcp/builtin/types";
import type { SkillRegistry } from "../agent/skills/SkillRegistry";
import { skillRegistry } from "../agent/skills/SkillRegistry";
import { skillDocuments } from "../agent/skills/SkillDocument";
import type { AgentTool, ToolRegistry } from "../agent/ToolRegistry";
import { toolRegistry } from "../agent/ToolRegistry";
import { permissionRows, redactCapabilityText } from "./permissionCopy";
import { agentsForTool, allAgentIds } from "./agents";
import {
  capabilityIdFromRuntimeTool,
  mcpServerCapabilityId,
  parseMcpPromptCapabilityId,
  parseMcpResourceCapabilityId,
  parseMcpServerCapabilityId,
  parseMcpToolCapabilityId,
  parseSkillCapabilityId,
  rawSkillId,
  skillCapabilityId,
} from "./ids";
import { readDisabledCapabilityIds } from "./overlay";
import { capabilityStatus, mcpCapabilityStatus, mcpConnectionStatus, uiToolCategory } from "./status";
import type {
  CapabilityDetail,
  CapabilityResolveOptions,
  CapabilitySummary,
  MCPServerCapability,
  McpChildCapability,
  SkillCapability,
  ToolCapability,
} from "./types";

export class CapabilityRegistry {
  constructor(
    private readonly tools: ToolRegistry = toolRegistry,
    private readonly skills: SkillRegistry = skillRegistry,
    private readonly mcp: MCPRegistry = mcpRegistry,
    private readonly getDisabledIds: () => string[] = readDisabledCapabilityIds,
  ) {}

  async list(): Promise<CapabilitySummary[]> {
    const skills = await this.listSkillSummaries();
    const native = this.listNativeToolSummaries();
    const mcp = this.listMcpSummaries();
    return [...skills, ...native, ...mcp];
  }

  async get(id: string): Promise<CapabilityDetail | null> {
    const skill = await this.getSkill(id);
    if (skill) return skill;
    const tool = this.getNativeTool(id);
    if (tool) return tool;
    const server = this.getMcpServer(id);
    if (server) return server;
    return this.getMcpChild(id);
  }

  async find(query: string): Promise<CapabilitySummary[]> {
    const needle = query.trim().toLowerCase();
    const items = await this.list();
    if (!needle) return items.filter((item) => item.kind === "skill" || item.kind === "tool" || item.kind === "mcp");
    return items.filter((item) => item.searchText.includes(needle));
  }

  resolve(options: CapabilityResolveOptions = {}) {
    return resolveAgentTools(this.tools, { ...options, disabledCapabilityIds: options.disabledCapabilityIds ?? this.getDisabledIds() });
  }

  isDisabled(id: string) {
    return this.getDisabledIds().includes(id);
  }

  private prepareSkills() {
    if (this.skills === skillRegistry) this.skills.bindDefaultFiles();
  }

  private async listSkillSummaries(): Promise<CapabilitySummary[]> {
    this.prepareSkills();
    const catalog = await this.skills.listCatalog();
    return catalog.map((skill) => {
      const id = skillCapabilityId(skill.origin, skill.id);
      const source = skill.origin === "project"
        ? { type: "project" as const, path: skill.sourcePath ?? `.kursor/skills/${skill.id}/SKILL.md` }
        : skill.origin === "global"
          ? { type: "user" as const, path: skill.sourcePath ?? `skills/${skill.id}/SKILL.md` }
          : { type: "builtin" as const, name: "Kursor" };
      const enabled = skill.enabled;
      return {
        id,
        type: "skill" as const,
        kind: "skill" as const,
        name: skill.name,
        displayName: skill.name,
        description: skill.description,
        version: skill.version,
        source,
        enabled,
        status: capabilityStatus(enabled),
        tags: [...skill.triggers],
        scope: skill.origin === "project" ? "project" as const : "global" as const,
        agentIds: allAgentIds(),
        sourcePath: skill.sourcePath,
        searchText: [
          skill.name,
          skill.description,
          skill.triggers.join(" "),
          source.type,
          skill.allowedTools.join(" "),
          id,
        ].join(" ").toLowerCase(),
      };
    });
  }

  private listNativeToolSummaries(): CapabilitySummary[] {
    const disabled = this.getDisabledIds();
    return this.tools.listEnabled()
      .filter((tool) => !isMcpRuntimeName(tool.name))
      .map((tool) => {
        const id = builtinToolCapabilityId(tool.name);
        const enabled = !disabled.includes(id);
        const category = uiToolCategory(tool.category);
        return {
          id,
          type: "tool" as const,
          kind: "tool" as const,
          name: tool.name,
          displayName: tool.name,
          description: tool.description,
          source: { type: "builtin" as const, name: "Kursor" },
          enabled,
          status: capabilityStatus(enabled),
          tags: [category, tool.riskLevel],
          category,
          riskLevel: tool.riskLevel,
          agentIds: agentsForTool(tool.name).map((agent) => agent.id),
          searchText: [tool.name, tool.description, category, "builtin", id].join(" ").toLowerCase(),
        };
      });
  }

  private listMcpSummaries(): CapabilitySummary[] {
    const servers = this.mcp.listServers();
    const items: CapabilitySummary[] = [];
    const seen = new Set<string>();
    for (const instance of builtInMcpRegistry.instances(servers)) {
      seen.add(instance.definition.serverId);
      items.push(...this.summariesForServer(instance.definition.serverId, instance.definition.displayName, instance.definition.description));
    }
    for (const server of servers) {
      if (seen.has(server.id)) continue;
      items.push(...this.summariesForServer(server.id, server.displayName ?? server.name, undefined));
    }
    return items;
  }

  private summariesForServer(serverId: string, fallbackName: string, fallbackDescription?: string): CapabilitySummary[] {
    const server = this.mcp.listServers().find((item) => item.id === serverId);
    const builtin = builtInMcpRegistry.get(serverId);
    const discovery = this.mcp.discoveryFor(serverId);
    const enabled = server?.enabled ?? false;
    const status = server
      ? mcpCapabilityStatus(server.status, server.enabled)
      : "unavailable";
    const connectionStatus = server
      ? mcpConnectionStatus(server.status, server.enabled)
      : "disconnected";
    const lifecycle = lifecycleFromSnapshot(server ?? null, isSetupIncomplete(server ?? null));
    const toolNames = (discovery?.tools ?? []).map((tool) => tool.name);
    const displayName = server?.displayName ?? builtin?.displayName ?? fallbackName;
    const description = server
      ? `${discovery?.tools.length ?? server.toolCount} tools · ${discovery?.resources.length ?? server.resourceCount} resources`
      : fallbackDescription ?? builtin?.description;
    const origin = server?.origin ?? "builtin";
    const source = origin === "project"
      ? { type: "project" as const, path: serverId }
      : origin === "builtin" || builtin
        ? { type: "builtin" as const, name: displayName }
        : { type: "mcp" as const, serverId };
    const id = mcpServerCapabilityId(serverId);
    const items: CapabilitySummary[] = [{
      id,
      type: "mcp",
      kind: "mcp",
      name: server?.name ?? builtin?.name ?? serverId,
      displayName,
      description,
      version: server?.version ?? builtin?.displayName,
      source,
      enabled,
      status,
      connectionStatus,
      tags: [server?.transport ?? builtin?.transports[0] ?? "stdio", lifecycle, ...toolNames],
      scope: server?.scope ?? builtin?.defaultScope ?? "global",
      agentIds: allAgentIds(),
      projectId: server?.projectId,
      toolCount: discovery?.tools.length ?? server?.toolCount ?? 0,
      resourceCount: discovery?.resources.length ?? server?.resourceCount ?? 0,
      promptCount: discovery?.prompts.length ?? server?.promptCount ?? 0,
      lastError: server?.lastError ?? undefined,
      searchText: [
        displayName,
        serverId,
        builtin?.id ?? "",
        toolNames.join(" "),
        lifecycle,
        "mcp",
        "built-in",
        id,
      ].join(" ").toLowerCase(),
    }];
    for (const tool of discovery?.tools ?? []) {
      items.push({
        id: tool.id,
        type: "mcp",
        kind: "mcp-tool",
        parentId: id,
        name: tool.name,
        displayName: tool.name,
        description: tool.description,
        source: { type: "mcp", serverId },
        enabled: enabled && tool.enabled,
        status: capabilityStatus(enabled && tool.enabled, status === "enabled"),
        connectionStatus,
        tags: [displayName, "mcp-tool"],
        agentIds: allAgentIds(),
        projectId: server?.projectId,
        searchText: [tool.name, tool.description ?? "", displayName, serverId, tool.id].join(" ").toLowerCase(),
      });
    }
    return items;
  }

  private async getSkill(id: string): Promise<SkillCapability | null> {
    this.prepareSkills();
    const parsed = parseSkillCapabilityId(id);
    const definitions = await this.skills.listDefinitions();
    const skill = definitions.find((item) => (
      item.id === rawSkillId(id)
      || skillCapabilityId(item.origin, item.id) === id
      || (parsed && item.id === parsed.skillId)
    ));
    if (!skill) return null;
    const capId = skillCapabilityId(skill.origin, skill.id);
    const source = skill.origin === "project"
      ? { type: "project" as const, path: skill.sourcePath ?? `.kursor/skills/${skill.id}/SKILL.md` }
      : skill.origin === "global"
        ? { type: "user" as const, path: skill.sourcePath ?? `skills/${skill.id}/SKILL.md` }
        : { type: "builtin" as const, name: "Kursor" };
    return {
      id: capId,
      type: "skill",
      name: skill.name,
      displayName: skill.name,
      description: skill.description,
      version: skill.version,
      source,
      enabled: skill.enabled,
      status: capabilityStatus(skill.enabled),
      tags: [...skill.triggers],
      dependencies: skill.allowedTools.map((tool) => ({
        capabilityId: builtinToolCapabilityId(tool),
        type: "tool" as const,
        name: tool,
      })),
      instructions: redactCapabilityText(skill.instructions),
      triggers: [...skill.triggers],
      allowedTools: [...skill.allowedTools],
      modelPreference: skill.modelPreference ?? undefined,
      scope: skill.origin === "project" ? "project" : "global",
      sourcePath: skill.sourcePath,
      supportingFiles: await skillDocuments.listSupporting(skill.origin, skill.id).catch(() => []),
    };
  }

  private getNativeTool(id: string): ToolCapability | null {
    const name = id.startsWith("builtin.tool.") ? id.slice("builtin.tool.".length) : id;
    const tool = this.tools.get(name);
    if (!tool || isMcpRuntimeName(tool.name)) return null;
    const capId = builtinToolCapabilityId(tool.name);
    const enabled = !this.getDisabledIds().includes(capId);
    return {
      id: capId,
      type: "tool",
      name: tool.name,
      displayName: tool.name,
      description: tool.description,
      source: { type: "builtin", name: "Kursor" },
      enabled,
      status: capabilityStatus(enabled),
      tags: [uiToolCategory(tool.category), tool.riskLevel],
      permissions: permissionRows(tool.capability, { approval: tool.approval }),
      category: uiToolCategory(tool.category),
      inputSchema: tool.parameters,
      requiresApproval: tool.approval !== "auto",
      riskLevel: tool.riskLevel,
      runtimeName: tool.name,
      approval: tool.approval,
    };
  }

  private getMcpServer(id: string): MCPServerCapability | null {
    const serverId = parseMcpServerCapabilityId(id);
    if (!serverId) return null;
    const server = this.mcp.listServers().find((item) => item.id === serverId);
    const builtin = builtInMcpRegistry.get(serverId);
    if (!server && !builtin) return null;
    const discovery = this.mcp.discoveryFor(serverId);
    const enabled = server?.enabled ?? false;
    const connectionStatus = server
      ? mcpConnectionStatus(server.status, server.enabled)
      : "disconnected";
    const lifecycle = lifecycleFromSnapshot(server ?? null, isSetupIncomplete(server ?? null));
    return {
      id: mcpServerCapabilityId(serverId),
      type: "mcp",
      name: server?.name ?? builtin?.name ?? serverId,
      displayName: server?.displayName ?? builtin?.displayName ?? serverId,
      description: builtin?.description ?? server?.lastError ?? undefined,
      version: server?.version,
      source: server?.origin === "project"
        ? { type: "project", path: serverId }
        : builtin || server?.origin === "builtin"
          ? { type: "builtin", name: server?.displayName ?? builtin?.displayName ?? serverId }
          : { type: "mcp", serverId },
      enabled,
      status: server ? mcpCapabilityStatus(server.status, server.enabled) : "unavailable",
      documentationUrl: builtin?.docsUrl,
      permissions: (builtin?.permissions ?? []).map((permission) => ({
        id: permission.id,
        group: permission.group,
        action: permission.action,
        allowed: true,
        scopeLabel: permission.risk,
        explanation: permission.explanation,
      })),
      serverName: server?.name ?? builtin?.name ?? serverId,
      transport: server?.transport ?? builtin?.transports[0] ?? "stdio",
      endpoint: server?.url,
      tools: (discovery?.tools ?? []).map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        enabled: tool.enabled,
      })),
      resources: (discovery?.resources ?? []).map((resource) => ({
        id: resource.id,
        name: resource.name ?? resource.uri,
        uri: resource.uri,
        description: resource.description,
      })),
      prompts: (discovery?.prompts ?? []).map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
      })),
      connectionStatus,
      scope: server?.scope ?? builtin?.defaultScope ?? "global",
      lastError: server?.lastError ?? undefined,
      metadata: {
        catalogId: builtin?.id,
        origin: server?.origin ?? (builtin ? "builtin" : "user"),
        lifecycle,
        riskLevel: builtin?.riskLevel,
        command: server?.command,
        args: server?.args,
        settings: server?.metadata?.settings,
      },
    };
  }

  private getMcpChild(id: string): McpChildCapability | null {
    const tool = parseMcpToolCapabilityId(id);
    const resource = parseMcpResourceCapabilityId(id);
    const prompt = parseMcpPromptCapabilityId(id);
    const serverId = tool?.serverId ?? resource?.serverId ?? prompt?.serverId;
    if (!serverId) return null;
    const server = this.mcp.listServers().find((item) => item.id === serverId);
    const discovery = this.mcp.discoveryFor(serverId);
    if (!server) return null;
    const parentId = mcpServerCapabilityId(serverId);
    const parentName = server.displayName ?? server.name;
    if (tool) {
      const match = discovery?.tools.find((item) => item.name === tool.toolName || item.id === id);
      if (!match) return null;
      return {
        id: match.id,
        type: "mcp",
        kind: "mcp-tool",
        name: match.name,
        displayName: match.name,
        description: match.description,
        source: { type: "mcp", serverId },
        enabled: server.enabled && match.enabled,
        status: capabilityStatus(server.enabled && match.enabled, mcpCapabilityStatus(server.status, server.enabled) === "enabled"),
        parentId,
        parentName,
        inputSchema: match.inputSchema,
        outputSchema: match.outputSchema,
        runtimeName: `mcp__${serverId}__${match.name}`,
      };
    }
    if (resource) {
      const match = discovery?.resources.find((item) => item.uri === resource.uri || item.id === id);
      if (!match) return null;
      return {
        id: match.id,
        type: "mcp",
        kind: "mcp-resource",
        name: match.name ?? match.uri,
        displayName: match.name ?? match.uri,
        description: match.description,
        source: { type: "mcp", serverId },
        enabled: server.enabled,
        status: mcpCapabilityStatus(server.status, server.enabled),
        parentId,
        parentName,
        uri: match.uri,
      };
    }
    if (prompt) {
      const match = discovery?.prompts.find((item) => item.name === prompt.promptName || item.id === id);
      if (!match) return null;
      return {
        id: match.id,
        type: "mcp",
        kind: "mcp-prompt",
        name: match.name,
        displayName: match.name,
        description: match.description,
        source: { type: "mcp", serverId },
        enabled: server.enabled,
        status: mcpCapabilityStatus(server.status, server.enabled),
        parentId,
        parentName,
      };
    }
    return null;
  }
}

export function toolNameMatches(name: string, pattern: string) {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

export function matchesAny(name: string, patterns?: string[]) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => toolNameMatches(name, pattern));
}

export function resolveAgentTools(
  registry: ToolRegistry,
  options: CapabilityResolveOptions = {},
): AgentTool[] {
  const disabled = new Set(options.disabledCapabilityIds ?? readDisabledCapabilityIds());
  return registry.listEnabled().filter((tool) => {
    if (matchesAny(tool.name, options.deniedTools)) return false;
    if (options.allowedTools && !matchesAny(tool.name, options.allowedTools)) return false;
    const id = capabilityIdFromRuntimeTool(tool.name);
    if (disabled.has(id)) return false;
    const parsed = isMcpRuntimeName(tool.name) ? tool.name.split("__")[1] : null;
    if (parsed && disabled.has(mcpServerCapabilityId(parsed))) return false;
    return true;
  });
}
