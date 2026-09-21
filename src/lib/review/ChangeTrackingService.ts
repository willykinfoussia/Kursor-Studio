import { FILE_MUTATE_TOOLS } from "../agent/recovery/types";
import { readPath } from "../agent/hooks/HookBus";
import { toolChangedPath } from "../agent/tools/result";
import { toolOutputOk } from "../agent/AgentStep";
import { diffTexts, toAiHunks } from "./diff";
import { reviewHash, utf8Bytes } from "./hash";
import { withRolledStatus } from "./status";
import { WorkspaceSnapshotService } from "./WorkspaceSnapshotService";
import {
  TEXT_BYTE_LIMIT,
  TEXT_LINE_LIMIT,
  cloneChangeSet,
  isOpenChangeSetStatus,
  type AiChangeSet,
  type AiFileChange,
  type ChangeStore,
  type FileChangeKind,
  type ReviewEventBase,
  type ReviewFiles,
} from "./types";
import type { AgentEvent } from "../agent/types";

export interface TrackingIdentity {
  accountId: string;
  projectId: string;
  runId: string;
  conversationId?: string;
  agentId?: string;
  model?: string;
}

export interface ChangeTrackingOptions {
  files: ReviewFiles;
  persist?: ChangeStore;
  snapshots?: WorkspaceSnapshotService;
  emit?: (event: AgentEvent) => void;
  now?: () => number;
  id?: () => string;
}

export function filterChangeSetsForConversation(
  items: readonly AiChangeSet[],
  conversationId: string | null,
): AiChangeSet[] {
  return items.filter((item) => {
    if (!conversationId) return !item.conversationId;
    return item.conversationId === conversationId;
  });
}

export class ChangeTrackingService {
  private readonly files: ReviewFiles;
  private readonly persist?: ChangeStore;
  private readonly snapshots: WorkspaceSnapshotService;
  private emitFn?: (event: AgentEvent) => void;
  private readonly now: () => number;
  private readonly id: () => string;
  private readonly sets = new Map<string, AiChangeSet>();
  private readonly listeners = new Set<(changeSet: AiChangeSet) => void>();
  writingPath: string | null = null;
  private notifying = false;

  constructor(options: ChangeTrackingOptions) {
    this.files = options.files;
    this.persist = options.persist;
    this.snapshots = options.snapshots ?? new WorkspaceSnapshotService(options.files);
    this.emitFn = options.emit;
    this.now = options.now ?? (() => Date.now());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  setEmit(emit: (event: AgentEvent) => void) {
    this.emitFn = emit;
  }

  subscribe(listener: (changeSet: AiChangeSet) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset() {
    this.sets.clear();
    this.snapshots.reset();
    this.writingPath = null;
  }

  listLive() {
    return [...this.sets.values()].map(cloneChangeSet);
  }

  get(id: string) {
    const changeSet = this.sets.get(id);
    return changeSet ? cloneChangeSet(changeSet) : null;
  }

  getByRun(runId: string) {
    for (const changeSet of this.sets.values()) {
      if (changeSet.runId === runId) return cloneChangeSet(changeSet);
    }
    return null;
  }

  openForProject(projectId: string) {
    return this.listLive().filter((item) => item.projectId === projectId && isOpenChangeSetStatus(item.status));
  }

  openForConversation(projectId: string, conversationId: string | null) {
    return filterChangeSetsForConversation(this.openForProject(projectId), conversationId);
  }

  pendingPath(projectId: string, path: string, exceptRunId?: string) {
    return this.openForProject(projectId).find((changeSet) => (
      changeSet.runId !== exceptRunId
      && changeSet.files.some((file) => file.path === path && file.status !== "accepted" && file.status !== "rejected")
    ));
  }

  replace(changeSet: AiChangeSet) {
    this.sets.set(changeSet.id, cloneChangeSet(changeSet));
    this.notify(changeSet);
  }

  async hydrate(projectId: string) {
    if (!this.persist) return this.openForProject(projectId);
    const loaded = await this.persist.listOpen(projectId);
    for (const changeSet of loaded) {
      const next = cloneChangeSet(changeSet);
      if (next.status === "active") {
        next.status = "pending-review";
        next.updatedAt = this.now();
        await this.persist.save(next);
      }
      this.sets.set(next.id, next);
    }
    return this.openForProject(projectId);
  }

  async prepareMutation(identity: TrackingIdentity, tool: string, input: unknown) {
    if (!FILE_MUTATE_TOOLS.has(tool) || !identity.projectId || !identity.runId) return;
    const path = readPath(input);
    if (!path) return;
    this.writingPath = path;
    await this.ensureSet(identity);
    await this.snapshots.capture(identity.runId, path);
    const changeSet = this.getByRun(identity.runId);
    if (changeSet) this.notify(changeSet);
  }

  async recordMutation(identity: TrackingIdentity, tool: string, toolCallId: string, input: unknown, output: unknown) {
    if (!FILE_MUTATE_TOOLS.has(tool) || !toolOutputOk(output) || !identity.projectId || !identity.runId) {
      this.writingPath = null;
      return null;
    }
    const path = toolChangedPath(output) || readPath(input);
    if (!path) {
      this.writingPath = null;
      return null;
    }
    const changeSet = await this.ensureSet(identity);
    const snapshot = await this.snapshots.capture(identity.runId, path);
    const proposed = tool === "delete_file" ? null : await this.files.read(path);
    const kind = inferKind(tool, snapshot.existed, proposed);
    const other = this.pendingPath(identity.projectId, path, identity.runId);
    if (other) {
      const collision = this.markCollision(other, path);
      this.emit("review-conflict-detected", {
        accountId: identity.accountId,
        projectId: identity.projectId,
        runId: identity.runId,
        changeSetId: collision.id,
        path,
        result: "conflict",
        error: "Another run still has pending review on this file.",
      });
    }
    const binary = this.files.isBinary(path);
    const tooLarge = isTooLarge(snapshot.content) || isTooLarge(proposed);
    const file = await this.upsertFile(changeSet, {
      path,
      kind,
      snapshot,
      proposed,
      binary,
      tooLarge,
      toolCallId,
    });
    this.detectRename(changeSet);
    const next = withRolledStatus({ ...changeSet, updatedAt: this.now(), status: "active" });
    this.sets.set(next.id, next);
    await this.persist?.save(next);
    this.emit("file-change-detected", {
      accountId: identity.accountId,
      projectId: identity.projectId,
      runId: identity.runId,
      changeSetId: next.id,
      fileChangeId: file.id,
      toolCallId,
      path,
      result: other ? "conflict" : "ok",
    });
    this.writingPath = null;
    this.notify(next);
    return cloneChangeSet(next);
  }

  async finalizeRun(runId: string) {
    const changeSet = [...this.sets.values()].find((item) => item.runId === runId);
    if (!changeSet) return null;
    this.writingPath = null;
    if (changeSet.files.length === 0) {
      this.sets.delete(changeSet.id);
      return null;
    }
    const next = withRolledStatus({
      ...changeSet,
      status: changeSet.files.some((file) => file.status === "conflicted" || file.status === "superseded")
        ? "conflicted"
        : "pending-review",
      updatedAt: this.now(),
    });
    this.sets.set(next.id, next);
    await this.persist?.save(next);
    this.notify(next);
    return cloneChangeSet(next);
  }

  private async ensureSet(identity: TrackingIdentity) {
    const existing = [...this.sets.values()].find((item) => item.runId === identity.runId);
    if (existing) return existing;
    const now = this.now();
    const changeSet: AiChangeSet = {
      id: this.id(),
      accountId: identity.accountId,
      projectId: identity.projectId,
      runId: identity.runId,
      conversationId: identity.conversationId,
      agentId: identity.agentId,
      model: identity.model,
      status: "active",
      createdAt: now,
      updatedAt: now,
      files: [],
    };
    this.sets.set(changeSet.id, changeSet);
    await this.persist?.save(changeSet);
    this.emit("change-set-created", {
      accountId: identity.accountId,
      projectId: identity.projectId,
      runId: identity.runId,
      changeSetId: changeSet.id,
      result: "ok",
    });
    this.notify(changeSet);
    return changeSet;
  }

  private async upsertFile(changeSet: AiChangeSet, input: {
    path: string;
    kind: FileChangeKind;
    snapshot: { existed: boolean; content: string | null; hash: string };
    proposed: string | null;
    binary: boolean;
    tooLarge: boolean;
    toolCallId: string;
  }) {
    const now = this.now();
    const existing = changeSet.files.find((file) => file.path === input.path);
    const proposedHash = await reviewHash(input.proposed);
    const id = existing?.id ?? this.id();
    let hunks = existing?.hunks ?? [];
    let additions = 0;
    let deletions = 0;
    if (!input.binary && !input.tooLarge) {
      const diff = diffTexts(input.path, input.snapshot.content, input.proposed);
      hunks = toAiHunks(id, diff.hunks, input.toolCallId, now, this.id);
      additions = diff.additions;
      deletions = diff.deletions;
    } else if (input.kind === "created") {
      additions = 1;
    } else if (input.kind === "deleted") {
      deletions = 1;
    }
    const file: AiFileChange = {
      id,
      changeSetId: changeSet.id,
      path: input.path,
      previousPath: existing?.previousPath,
      kind: input.kind,
      baseHash: input.snapshot.hash,
      proposedHash,
      currentHash: proposedHash,
      baseContent: input.tooLarge ? undefined : input.snapshot.content,
      proposedContent: input.tooLarge ? undefined : input.proposed,
      additions,
      deletions,
      status: existing?.status === "superseded" ? "superseded" : "pending",
      binary: input.binary,
      tooLarge: input.tooLarge,
      hunks,
      toolCallIds: unique([...(existing?.toolCallIds ?? []), input.toolCallId]),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const index = changeSet.files.findIndex((item) => item.id === id);
    if (index >= 0) changeSet.files[index] = file;
    else changeSet.files.push(file);
    for (const hunk of file.hunks) {
      this.emit("change-hunk-created", {
        accountId: changeSet.accountId,
        projectId: changeSet.projectId,
        runId: changeSet.runId,
        changeSetId: changeSet.id,
        fileChangeId: file.id,
        hunkId: hunk.id,
        toolCallId: input.toolCallId,
        path: file.path,
        result: "ok",
      });
    }
    return file;
  }

  private detectRename(changeSet: AiChangeSet) {
    const deleted = changeSet.files.filter((file) => file.kind === "deleted" && file.status === "pending");
    const created = changeSet.files.filter((file) => file.kind === "created" && file.status === "pending");
    for (const createdFile of created) {
      if (createdFile.previousPath) continue;
      const match = deleted.find((file) => file.baseHash && file.baseHash === createdFile.proposedHash);
      if (!match) continue;
      createdFile.kind = "renamed";
      createdFile.previousPath = match.path;
      createdFile.baseContent = match.baseContent;
      createdFile.baseHash = match.baseHash;
      if (createdFile.baseHash && createdFile.baseHash === createdFile.proposedHash) {
        createdFile.hunks = [];
        createdFile.additions = 0;
        createdFile.deletions = 0;
      }
      changeSet.files = changeSet.files.filter((file) => file.id !== match.id);
    }
  }

  private markCollision(changeSet: AiChangeSet, path: string) {
    const next: AiChangeSet = {
      ...changeSet,
      status: "conflicted",
      updatedAt: this.now(),
      files: changeSet.files.map((file) => file.path === path ? { ...file, status: "superseded" as const } : file),
    };
    this.sets.set(next.id, next);
    void this.persist?.save(next);
    this.notify(next);
    return next;
  }

  private emit(type: AgentEvent["type"], base: ReviewEventBase) {
    this.emitFn?.({ type, ...base } as AgentEvent);
  }

  private notify(changeSet: AiChangeSet) {
    if (this.notifying) return;
    this.notifying = true;
    try {
      const clone = cloneChangeSet(changeSet);
      for (const listener of this.listeners) listener(clone);
    } finally {
      this.notifying = false;
    }
  }
}

function inferKind(tool: string, existed: boolean, proposed: string | null): FileChangeKind {
  if (tool === "delete_file" || proposed === null) return existed ? "deleted" : "deleted";
  if (!existed || tool === "create_file") return "created";
  return "modified";
}

function isTooLarge(content: string | null) {
  if (content === null) return false;
  if (utf8Bytes(content) > TEXT_BYTE_LIMIT) return true;
  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lines += 1;
    if (lines > TEXT_LINE_LIMIT) return true;
  }
  return false;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export class MemoryChangeStore implements ChangeStore {
  readonly sets = new Map<string, AiChangeSet>();
  readonly decisions: import("./types").AiReviewDecision[] = [];

  async save(changeSet: AiChangeSet) {
    this.sets.set(changeSet.id, cloneChangeSet(changeSet));
  }

  async get(id: string) {
    const changeSet = this.sets.get(id);
    return changeSet ? cloneChangeSet(changeSet) : null;
  }

  async listOpen(projectId: string) {
    return [...this.sets.values()]
      .filter((item) => item.projectId === projectId && isOpenChangeSetStatus(item.status))
      .map(cloneChangeSet);
  }

  async saveDecision(decision: import("./types").AiReviewDecision) {
    this.decisions.push({ ...decision });
  }
}
