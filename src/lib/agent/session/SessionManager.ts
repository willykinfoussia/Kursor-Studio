import {
  emptySnapshot,
  INTERRUPTED_TOOL_ERROR,
  parseCheckpoint,
  serializeCheckpoint,
  type AgentSession,
  type RunStore,
  type SessionSnapshot,
  type SessionStatus,
  type SessionStore,
  type ToolCallStore,
} from "./types";

export class SessionManager {
  private active: AgentSession | null = null;

  constructor(
    private readonly sessions: SessionStore,
    private readonly runs: RunStore,
    private readonly tools: ToolCallStore,
  ) {}

  getActive() {
    return this.active;
  }

  getActiveSnapshot(): SessionSnapshot | null {
    return parseCheckpoint(this.active?.checkpointJson);
  }

  async ensureActive(input: {
    conversationId: string;
    projectId: string | null;
    goal: string;
  }): Promise<{ session: AgentSession; created: boolean }> {
    const now = Date.now();
    if (
      this.active
      && this.active.status === "running"
      && this.active.conversationId === input.conversationId
    ) {
      this.active = {
        ...this.active,
        projectId: input.projectId ?? this.active.projectId,
        currentGoal: input.goal || this.active.currentGoal,
        updatedAt: now,
      };
      await this.sessions.upsert(this.active);
      return { session: this.active, created: false };
    }

    const running = (await this.sessions.list(input.projectId, "running"))
      .find((session) => session.conversationId === input.conversationId);
    if (running) {
      this.active = {
        ...running,
        currentGoal: input.goal || running.currentGoal,
        updatedAt: now,
      };
      await this.sessions.upsert(this.active);
      return { session: this.active, created: false };
    }

    this.active = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      conversationId: input.conversationId,
      status: "running",
      startedAt: now,
      updatedAt: now,
      currentStep: "planning",
      currentGoal: input.goal,
      checkpointJson: null,
    };
    await this.sessions.upsert(this.active);
    return { session: this.active, created: true };
  }

  async snapshot(
    sessionId: string,
    snapshot: SessionSnapshot,
    extras: Partial<Pick<AgentSession, "currentStep" | "currentGoal" | "status">> = {},
  ) {
    const existing = this.active?.id === sessionId
      ? this.active
      : await this.sessions.get(sessionId);
    if (!existing) return null;
    const next: AgentSession = {
      ...existing,
      ...extras,
      updatedAt: Date.now(),
      checkpointJson: serializeCheckpoint(snapshot),
    };
    if (this.active?.id === sessionId) this.active = next;
    await this.sessions.upsert(next);
    return next;
  }

  async get(id: string) {
    const session = await this.sessions.get(id);
    if (session && this.active?.id === id) this.active = session;
    return session;
  }

  async listInterrupted(projectId?: string | null) {
    return this.sessions.listInterrupted(projectId);
  }

  async setStatus(sessionId: string, status: SessionStatus, extras: Partial<AgentSession> = {}) {
    const existing = this.active?.id === sessionId
      ? this.active
      : await this.sessions.get(sessionId);
    if (!existing) return null;
    const next: AgentSession = {
      ...existing,
      ...extras,
      status,
      updatedAt: Date.now(),
    };
    if (this.active?.id === sessionId) this.active = next;
    await this.sessions.upsert(next);
    return next;
  }

  async recover(projectId?: string | null) {
    const running = await this.sessions.list(projectId, "running");
    const now = Date.now();
    for (const session of running) {
      const snap = parseCheckpoint(session.checkpointJson) ?? emptySnapshot();
      const inflight = snap.toolCalls.some((call) => call.status === "running")
        || isInFlightState(snap.agentState);
      if (!inflight) {
        await this.sessions.upsert({
          ...session,
          status: "completed",
          updatedAt: now,
        });
        continue;
      }
      const toolCalls = snap.toolCalls.map((call) => (
        call.status === "running"
          ? {
              ...call,
              status: "failed" as const,
              output: { ok: false, error: INTERRUPTED_TOOL_ERROR },
            }
          : call
      ));
      if (snap.runId) {
        const run = await this.runs.get(snap.runId);
        if (run && run.status === "running") {
          await this.runs.upsert({
            ...run,
            status: "cancelled",
            finishedAt: now,
            error: INTERRUPTED_TOOL_ERROR,
          });
        }
        const records = await this.tools.list(snap.runId);
        for (const record of records) {
          if (record.status === "running") {
            await this.tools.upsert({
              ...record,
              status: "cancelled",
              error: INTERRUPTED_TOOL_ERROR,
              finishedAt: now,
            });
          }
        }
      }
      await this.sessions.upsert({
        ...session,
        status: "interrupted",
        updatedAt: now,
        checkpointJson: serializeCheckpoint({
          ...snap,
          toolCalls,
          agentState: "cancelled",
        }),
      });
    }
    if (this.active) {
      const latest = await this.sessions.get(this.active.id);
      if (latest) this.active = latest;
    }
    return this.sessions.listInterrupted(projectId);
  }

  async restore(sessionId: string) {
    const session = await this.sessions.get(sessionId);
    if (!session) return null;
    const snapshot = parseCheckpoint(session.checkpointJson) ?? emptySnapshot();
    this.active = {
      ...session,
      status: "running",
      updatedAt: Date.now(),
    };
    await this.sessions.upsert(this.active);
    return { session: this.active, snapshot };
  }
}

const IN_FLIGHT: ReadonlySet<string> = new Set([
  "planning",
  "thinking",
  "streaming",
  "tool_call",
  "waiting_approval",
  "tool_result",
  "verifying",
  "fallback",
]);

function isInFlightState(state: string) {
  return IN_FLIGHT.has(state);
}
