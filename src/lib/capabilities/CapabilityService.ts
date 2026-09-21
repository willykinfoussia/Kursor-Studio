import { mcpServerManager } from "../mcp/MCPServerManager";
import { mcpRegistry } from "../mcp/MCPRegistry";
import { mcpConfigurationManager } from "../mcp/MCPConfigurationManager";
import { skillDocuments, SkillDocumentError, type SkillDocumentScope, type SkillDraft } from "../agent/skills/SkillDocument";
import { packToDraft, type SkillPackSkill } from "../agent/skills/SkillPack";
import { skillRegistry } from "../agent/skills/SkillRegistry";
import { useSettingsStore } from "../../stores/settingsStore";
import { toolCallRepository } from "../storage/toolCallRepository";
import { eventTraceRepository } from "../storage/eventTraceRepository";
import { toRunEventFromStored } from "../workflow/events";
import { useRunStore } from "../../stores/runStore";
import { CapabilityRegistry } from "./CapabilityRegistry";
import {
  aggregateCapabilityStats,
  usageFromMcp,
  usageFromSkillSelected,
  usageFromToolCall,
  type ObservedUsageEvent,
} from "./CapabilityUsage";
import { parseMcpServerCapabilityId, parseMcpToolCapabilityId, parseSkillCapabilityId, skillCapabilityId } from "./ids";
import { readDisabledCapabilityIds, withDisabledCapability } from "./overlay";
import { applyCapabilityFilters, catalogItems, countByType, matchesQuery } from "./query";
import type { CapabilityFilters, CapabilityStats, CapabilitySummary } from "./types";

export class CapabilityService {
  constructor(private readonly registry: CapabilityRegistry) {}

  listCapabilities() {
    return this.registry.list();
  }

  getCapability(id: string) {
    return this.registry.get(id);
  }

  async findCapabilities(query: string, filters: CapabilityFilters = {}) {
    const items = await this.registry.list();
    return applyCapabilityFilters(catalogItems(items, query), filters, query);
  }

  async counts() {
    return countByType(await this.registry.list());
  }

  async getDependencies(id: string) {
    const detail = await this.registry.get(id);
    return detail && "dependencies" in detail ? detail.dependencies ?? [] : [];
  }

  async getUsage(id: string, extras: ObservedUsageEvent[] = []): Promise<CapabilityStats> {
    const observed = [...extras, ...liveUsageEvents(), ...await persistedUsageEvents()];
    const stats = aggregateCapabilityStats(observed, id);
    const childIds = relatedUsageIds(id);
    if (childIds.length === 0) return stats;
    const related = observed.filter((event) => event.capabilityId === id || childIds.includes(event.capabilityId));
    const combined = aggregateCapabilityStats(related.map((event) => ({ ...event, capabilityId: id })), id);
    return combined.totalUses > 0 ? combined : stats;
  }

  enableCapability(id: string) {
    return this.setEnabled(id, true);
  }

  disableCapability(id: string) {
    return this.setEnabled(id, false);
  }

  async setEnabled(id: string, enabled: boolean) {
    const tool = parseMcpToolCapabilityId(id);
    if (tool) {
      await mcpConfigurationManager.setToolEnabled(tool.serverId, id, enabled);
      return this.registry.get(id);
    }
    const serverId = parseMcpServerCapabilityId(id);
    if (serverId) {
      if (enabled) await mcpServerManager.enable(serverId);
      else await mcpServerManager.disable(serverId);
      await mcpRegistry.sync();
      return this.registry.get(id);
    }
    const skill = parseSkillCapabilityId(id);
    if (skill) skillRegistry.setEnabled(skill.skillId, enabled);
    const next = withDisabledCapability(readDisabledCapabilityIds(), id, !enabled);
    useSettingsStore.getState().update("disabledCapabilityIds", next);
    return this.registry.get(id);
  }

  filter(items: CapabilitySummary[], filters: CapabilityFilters, query: string) {
    return applyCapabilityFilters(catalogItems(items, query), filters, query);
  }

  matches(item: CapabilitySummary, query: string) {
    return matchesQuery(item, query);
  }

  async createSkill(scope: SkillDocumentScope, draft: SkillDraft) {
    const saved = await skillDocuments.create(scope, draft);
    await this.registry.list();
    return this.registry.get(skillCapabilityId(scope, saved.id));
  }

  async updateSkill(capabilityId: string, draft: SkillDraft) {
    const scope = writableSkillScope(capabilityId);
    const saved = await skillDocuments.update(scope, { ...draft, id: draft.id || parseSkillCapabilityId(capabilityId)?.skillId || draft.id });
    await this.registry.list();
    return this.registry.get(skillCapabilityId(scope, saved.id));
  }

  async deleteSkill(capabilityId: string) {
    const parsed = parseSkillCapabilityId(capabilityId);
    const scope = writableSkillScope(capabilityId);
    await skillDocuments.remove(scope, parsed?.skillId ?? capabilityId);
    await this.registry.list();
  }

  async importSkillPack(scope: SkillDocumentScope, packs: readonly SkillPackSkill[]) {
    const imported: string[] = [];
    const skipped: string[] = [];
    for (const pack of packs) {
      try {
        const draft = packToDraft(pack);
        await skillDocuments.create(scope, { ...draft, rawMarkdown: pack.skillMd });
        imported.push(draft.id);
      } catch (error) {
        if (error instanceof SkillDocumentError && error.code === "already_exists") {
          skipped.push(pack.id);
          continue;
        }
        throw error;
      }
    }
    await this.registry.list();
    return { imported, skipped };
  }
}

function writableSkillScope(capabilityId: string): SkillDocumentScope {
  const parsed = parseSkillCapabilityId(capabilityId);
  if (!parsed || parsed.origin === "builtin") {
    throw new SkillDocumentError("builtin_readonly", "Built-in skills cannot be edited or deleted.");
  }
  return parsed.origin === "user" ? "user" : "project";
}

function isFailedOutput(output: unknown) {
  return Boolean(output && typeof output === "object" && (output as { ok?: unknown }).ok === false);
}

function liveUsageEvents(): ObservedUsageEvent[] {
  try {
    const run = useRunStore.getState();
    return run.events.flatMap((event) => {
      const payload = event.payload;
      if (payload.type === "tool-started" || payload.type === "tool-completed") {
        const failed = payload.type === "tool-completed" && isFailedOutput(payload.output);
        return [usageFromToolCall({
          id: payload.id,
          agentRunId: event.runId,
          toolName: payload.tool,
          status: payload.type === "tool-started" ? "started" : failed ? "failed" : "completed",
          startedAt: event.timestamp,
          finishedAt: payload.type === "tool-completed" ? event.timestamp : undefined,
          title: run.activeRun?.title,
          agentId: run.activeRun?.agentId,
          projectId: run.activeRun?.projectId,
        })];
      }
      if (payload.type === "skill-selected") {
        return [usageFromSkillSelected({
          skillId: payload.skillId,
          runId: event.runId,
          startedAt: event.timestamp,
          title: run.activeRun?.title,
          agentId: run.activeRun?.agentId,
          projectId: run.activeRun?.projectId,
        })];
      }
      if (payload.type === "mcp-tool-started" || payload.type === "mcp-tool-completed") {
        return [usageFromMcp({
          serverId: payload.serverId,
          toolName: payload.toolName,
          runId: event.runId,
          status: payload.type === "mcp-tool-started" ? "started" : payload.success === false ? "failed" : "completed",
          startedAt: event.timestamp,
          finishedAt: payload.type === "mcp-tool-completed" ? event.timestamp : undefined,
          title: run.activeRun?.title,
          id: payload.id,
        })];
      }
      return [];
    });
  } catch {
    return [];
  }
}

async function persistedUsageEvents(): Promise<ObservedUsageEvent[]> {
  try {
    const runId = useRunStore.getState().viewedRunId ?? useRunStore.getState().liveRunId;
    if (!runId) return [];
    const [calls, traces] = await Promise.all([
      toolCallRepository.list(runId).catch(() => []),
      eventTraceRepository.list(runId).catch(() => []),
    ]);
    const fromCalls = calls.map((call) => usageFromToolCall({
      id: call.id,
      agentRunId: call.agentRunId,
      toolName: call.toolName,
      status: call.status,
      startedAt: call.startedAt,
      finishedAt: call.finishedAt,
    }));
    const fromTraces = traces.flatMap((trace) => {
      const event = toRunEventFromStored(trace);
      if (!event) return [];
      if (event.payload.type === "skill-selected") {
        return [usageFromSkillSelected({
          skillId: event.payload.skillId,
          runId: event.runId,
          startedAt: event.timestamp,
        })];
      }
      return [];
    });
    return [...fromCalls, ...fromTraces];
  } catch {
    return [];
  }
}

function relatedUsageIds(id: string) {
  const serverId = parseMcpServerCapabilityId(id);
  if (!serverId) return [];
  return (mcpRegistry.discoveryFor(serverId)?.tools ?? []).map((tool) => tool.id);
}
