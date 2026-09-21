import { isTauri } from "../../tauri/invoke";
import { taskRepository } from "../../storage/taskRepository";
import type { TaskRecord } from "../../storage/types";

export interface CreateTaskInput {
  title: string;
  projectId?: string | null;
  agentRunId?: string | null;
  description?: string | null;
}

export class TaskManager {
  private readonly records = new Map<string, TaskRecord>();
  private activeId: string | null = null;

  getActiveId() {
    return this.activeId;
  }

  getActive() {
    return this.activeId ? this.records.get(this.activeId) ?? null : null;
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const now = Date.now();
    const title = input.title.trim() || "Agent task";
    const record: TaskRecord = {
      id: crypto.randomUUID(),
      projectId: input.projectId ?? null,
      agentRunId: input.agentRunId ?? null,
      title: title.length > 120 ? `${title.slice(0, 119)}…` : title,
      description: input.description ?? null,
      status: "running",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.records.set(record.id, record);
    this.activeId = record.id;
    await persist(record);
    return record;
  }

  async update(id: string, patch: Partial<Pick<TaskRecord, "title" | "status" | "progress" | "agentRunId" | "description">>) {
    const current = this.records.get(id);
    if (!current) return null;
    const now = Date.now();
    const next: TaskRecord = {
      ...current,
      ...patch,
      updatedAt: now,
      completedAt: patch.status === "completed" || patch.status === "failed"
        ? now
        : current.completedAt,
    };
    this.records.set(id, next);
    await persist(next);
    return next;
  }

  async attachRun(agentRunId: string) {
    if (!this.activeId) return null;
    return this.update(this.activeId, { agentRunId });
  }

  async complete(progress = 100) {
    if (!this.activeId) return null;
    return this.update(this.activeId, { status: "completed", progress });
  }

  async fail() {
    if (!this.activeId) return null;
    return this.update(this.activeId, { status: "failed" });
  }

  async upsertStep(step: { id: string; title: string; status: string; progress: number; projectId?: string | null; agentRunId?: string | null }) {
    const now = Date.now();
    const existing = this.records.get(step.id);
    const record: TaskRecord = {
      id: step.id,
      projectId: step.projectId ?? existing?.projectId ?? null,
      agentRunId: step.agentRunId ?? existing?.agentRunId ?? this.getActive()?.agentRunId ?? null,
      title: step.title,
      description: existing?.description ?? null,
      status: step.status,
      progress: step.progress,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      completedAt: step.status === "completed" || step.status === "failed" ? now : null,
    };
    this.records.set(record.id, record);
    await persist(record);
    return record;
  }

  async list(projectId?: string | null): Promise<TaskRecord[]> {
    if (isTauri()) {
      const persisted = await taskRepository.list(projectId);
      for (const record of persisted) this.records.set(record.id, record);
      return persisted;
    }
    return [...this.records.values()]
      .filter((record) => !projectId || record.projectId === projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  clearActive() {
    this.activeId = null;
  }
}

export const taskManager = new TaskManager();

async function persist(record: TaskRecord) {
  if (!isTauri()) return;
  await taskRepository.upsert(record);
}
