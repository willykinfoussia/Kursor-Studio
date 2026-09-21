import { capabilityIdFromRuntimeTool, mcpServerCapabilityId, skillCapabilityId } from "./ids";
import type { CapabilityRecentRun, CapabilityStats, CapabilityUsage } from "./types";

export interface ObservedUsageEvent {
  capabilityId: string;
  runId: string;
  agentId?: string;
  projectId?: string;
  stepId?: string;
  startedAt: number;
  finishedAt?: number;
  status: "started" | "completed" | "failed";
  title?: string;
  usageInstanceId?: string;
}

export function capabilityIdFromToolName(toolName: string) {
  return capabilityIdFromRuntimeTool(toolName);
}

export function aggregateCapabilityStats(
  events: readonly ObservedUsageEvent[],
  capabilityId: string,
): CapabilityStats {
  const matched = events.filter((event) => event.capabilityId === capabilityId);
  if (matched.length === 0) {
    return {
      totalUses: 0,
      lastUsedAt: null,
      successRate: null,
      avgDurationMs: null,
      agentIds: [],
      projectIds: [],
      recentRuns: [],
    };
  }
  const finished = matched.filter((event) => event.status === "completed" || event.status === "failed");
  const succeeded = finished.filter((event) => event.status === "completed");
  const durations = finished
    .map((event) => event.finishedAt && event.startedAt ? event.finishedAt - event.startedAt : null)
    .filter((value): value is number => value != null && value >= 0);
  const lastUsedAt = Math.max(...matched.map((event) => event.finishedAt ?? event.startedAt));
  const runs = new Map<string, CapabilityRecentRun>();
  for (const event of matched) {
    const existing = runs.get(event.runId);
    if (!existing) {
      runs.set(event.runId, {
        runId: event.runId,
        title: event.title || event.runId,
        usageInstanceId: event.usageInstanceId,
        startedAt: event.startedAt,
      });
    }
  }
  return {
    totalUses: matched.length,
    lastUsedAt,
    successRate: finished.length > 0 ? succeeded.length / finished.length : null,
    avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    agentIds: [...new Set(matched.map((event) => event.agentId).filter((value): value is string => Boolean(value)))],
    projectIds: [...new Set(matched.map((event) => event.projectId).filter((value): value is string => Boolean(value)))],
    recentRuns: [...runs.values()].sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0)).slice(0, 8),
  };
}

export function usageFromToolCall(input: {
  id: string;
  agentRunId: string;
  toolName: string;
  status: string;
  startedAt?: number | null;
  finishedAt?: number | null;
  agentId?: string;
  projectId?: string;
  title?: string;
}): ObservedUsageEvent {
  return {
    capabilityId: capabilityIdFromToolName(input.toolName),
    runId: input.agentRunId,
    agentId: input.agentId,
    projectId: input.projectId,
    startedAt: input.startedAt ?? 0,
    finishedAt: input.finishedAt ?? undefined,
    status: input.status === "failed" || input.status === "error" ? "failed" : input.status === "started" ? "started" : "completed",
    title: input.title,
    usageInstanceId: `tool:${input.id}`,
  };
}

export function usageFromSkillSelected(input: {
  skillId: string;
  origin?: "builtin" | "project" | "global" | "user";
  runId: string;
  agentId?: string;
  projectId?: string;
  startedAt: number;
  title?: string;
}): ObservedUsageEvent {
  const origin = input.origin ?? "builtin";
  return {
    capabilityId: skillCapabilityId(origin, input.skillId),
    runId: input.runId,
    agentId: input.agentId,
    projectId: input.projectId,
    startedAt: input.startedAt,
    finishedAt: input.startedAt,
    status: "completed",
    title: input.title,
    usageInstanceId: input.skillId.includes(":") ? input.skillId : `skill:${input.skillId}`,
  };
}

export function usageFromMcp(input: {
  capabilityId?: string;
  serverId: string;
  toolName?: string;
  runId: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  agentId?: string;
  title?: string;
  id?: string;
}): ObservedUsageEvent {
  return {
    capabilityId: input.capabilityId
      ?? (input.toolName ? capabilityIdFromRuntimeTool(`mcp__${input.serverId}__${input.toolName}`) : mcpServerCapabilityId(input.serverId)),
    runId: input.runId,
    agentId: input.agentId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status === "failed" ? "failed" : input.status === "started" ? "started" : "completed",
    title: input.title,
    usageInstanceId: input.id ? `tool:${input.id}` : undefined,
  };
}

export function emptyStats(): CapabilityStats {
  return aggregateCapabilityStats([], "");
}

export type { CapabilityUsage };
