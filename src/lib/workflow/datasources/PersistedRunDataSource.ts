import { agentRunRepository } from "../../storage/agentRunRepository";
import { eventTraceRepository } from "../../storage/eventTraceRepository";
import { toRunEventFromStored } from "../events";
import { projectRun } from "../RunGraphProjector";
import type { AgentGraphEdge, AgentGraphNode, AgentRun, AgentRunStatus, RunDataSource } from "../types";
import type { AgentRunRecord } from "../../storage/types";

export function agentRunFromRecord(record: AgentRunRecord, extras: Partial<AgentRun> = {}): AgentRun {
  return {
    id: record.id,
    accountId: record.accountId ?? "",
    projectId: record.projectId ?? "",
    conversationId: record.conversationId ?? undefined,
    agentId: record.agentId ?? "coding-agent",
    status: asRunStatus(record.status),
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? undefined,
    model: record.model ?? undefined,
    totalSteps: extras.totalSteps ?? 0,
    totalToolCalls: extras.totalToolCalls ?? 0,
    inputTokens: extras.inputTokens,
    outputTokens: extras.outputTokens,
    error: record.error ?? undefined,
    title: extras.title,
    fallbackCount: extras.fallbackCount,
  };
}

function asRunStatus(status: string): AgentRunStatus {
  if (status === "running" || status === "pending" || status === "completed" || status === "failed" || status === "cancelled") {
    return status;
  }
  return "failed";
}

export class PersistedRunDataSource implements RunDataSource {
  async getRun(runId: string): Promise<AgentRun> {
    const record = await agentRunRepository.get(runId);
    const traces = await eventTraceRepository.list(runId);
    const events = traces.map(toRunEventFromStored).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const projected = projectRun(events);
    if (record) return { ...agentRunFromRecord(record), ...projected.run, id: record.id };
    return projected.run;
  }

  async getNodes(runId: string): Promise<AgentGraphNode[]> {
    const traces = await eventTraceRepository.list(runId);
    const events = traces.map(toRunEventFromStored).filter((item): item is NonNullable<typeof item> => Boolean(item));
    return projectRun(events).nodes;
  }

  async getEdges(runId: string): Promise<AgentGraphEdge[]> {
    const traces = await eventTraceRepository.list(runId);
    const events = traces.map(toRunEventFromStored).filter((item): item is NonNullable<typeof item> => Boolean(item));
    return projectRun(events).edges;
  }
}
