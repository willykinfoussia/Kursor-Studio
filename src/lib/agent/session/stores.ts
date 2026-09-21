import { isTauri } from "../../tauri/invoke";
import { agentRunRepository } from "../../storage/agentRunRepository";
import { sessionRepository } from "../../storage/sessionRepository";
import { toolCallRepository } from "../../storage/toolCallRepository";
import type { AgentRunRecord, AgentSessionRecord, ToolCallRecord } from "../../storage/types";
import type {
  AgentSession,
  RunStore,
  SessionStatus,
  SessionStore,
  ToolCallStore,
} from "./types";

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AgentSession>();

  async upsert(session: AgentSession) {
    this.sessions.set(session.id, { ...session });
  }

  async get(id: string) {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async list(projectId?: string | null, status?: SessionStatus | null) {
    return [...this.sessions.values()]
      .filter((session) => {
        if (projectId != null && session.projectId !== projectId) return false;
        if (status && session.status !== status) return false;
        return true;
      })
      .map((session) => ({ ...session }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listInterrupted(projectId?: string | null) {
    return this.list(projectId, "interrupted");
  }
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, AgentRunRecord>();

  async upsert(run: AgentRunRecord) {
    this.runs.set(run.id, { ...run });
  }

  async get(id: string) {
    const run = this.runs.get(id);
    return run ? { ...run } : null;
  }
}

export class MemoryToolCallStore implements ToolCallStore {
  private readonly calls = new Map<string, ToolCallRecord>();

  async upsert(call: ToolCallRecord) {
    this.calls.set(call.id, { ...call });
  }

  async list(agentRunId: string) {
    return [...this.calls.values()]
      .filter((call) => call.agentRunId === agentRunId)
      .map((call) => ({ ...call }))
      .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0));
  }
}

function toSession(record: AgentSessionRecord): AgentSession {
  return {
    id: record.id,
    projectId: record.projectId ?? null,
    conversationId: record.conversationId,
    status: record.status as AgentSession["status"],
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    currentStep: record.currentStep ?? null,
    currentGoal: record.currentGoal ?? null,
    checkpointJson: record.checkpointJson ?? null,
  };
}

function toRecord(session: AgentSession): AgentSessionRecord {
  return {
    id: session.id,
    projectId: session.projectId,
    conversationId: session.conversationId,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    currentStep: session.currentStep,
    currentGoal: session.currentGoal,
    checkpointJson: session.checkpointJson,
  };
}

export const tauriSessionStore: SessionStore = {
  upsert: (session) => sessionRepository.upsert(toRecord(session)),
  get: async (id) => {
    const record = await sessionRepository.get(id);
    return record ? toSession(record) : null;
  },
  list: async (projectId, status) => {
    const records = await sessionRepository.list(projectId, status);
    return records.map(toSession);
  },
  listInterrupted: async (projectId) => {
    const records = await sessionRepository.listInterrupted(projectId);
    return records.map(toSession);
  },
};

export const tauriRunStore: RunStore = {
  upsert: (run) => agentRunRepository.upsert(run),
  get: (id) => agentRunRepository.get(id),
};

export const tauriToolCallStore: ToolCallStore = {
  upsert: (call) => toolCallRepository.upsert(call),
  list: (agentRunId) => toolCallRepository.list(agentRunId),
};

export function createSessionStores() {
  if (isTauri()) {
    return {
      sessions: tauriSessionStore,
      runs: tauriRunStore,
      tools: tauriToolCallStore,
    };
  }
  return {
    sessions: new MemorySessionStore(),
    runs: new MemoryRunStore(),
    tools: new MemoryToolCallStore(),
  };
}
