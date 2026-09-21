import { classifyContent, relationFromHashes, resolveConflictContent, type FileRelation } from "./ConflictDetectionService";
import { reviewHash } from "./hash";
import { applyForward, applyHunks, applyReverse } from "./patch";
import { withRolledStatus } from "./status";
import {
  ABSENT_HASH,
  cloneChangeSet,
  type AiChangeSet,
  type AiFileChange,
  type AiReviewDecision,
  type ChangeStore,
  type ReviewConflictAction,
  type ReviewDecisionKind,
  type ReviewDecisionScope,
  type ReviewEventBase,
  type ReviewFiles,
  type ReviewOperationResult,
} from "./types";
import type { AgentEvent } from "../agent/types";
import { ChangeTrackingService } from "./ChangeTrackingService";

export interface ReviewServiceOptions {
  files: ReviewFiles;
  tracking: ChangeTrackingService;
  persist?: ChangeStore;
  emit?: (event: AgentEvent) => void;
  now?: () => number;
  id?: () => string;
}

export class ReviewService {
  private readonly files: ReviewFiles;
  private readonly tracking: ChangeTrackingService;
  private readonly persist?: ChangeStore;
  private readonly emitFn?: (event: AgentEvent) => void;
  private readonly now: () => number;
  private readonly id: () => string;

  constructor(options: ReviewServiceOptions) {
    this.files = options.files;
    this.tracking = options.tracking;
    this.persist = options.persist;
    this.emitFn = options.emit;
    this.now = options.now ?? (() => Date.now());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async acceptAll(changeSetId: string) {
    return this.decideAll(changeSetId, "accept");
  }

  async rejectAll(changeSetId: string) {
    return this.decideAll(changeSetId, "reject");
  }

  async acceptFile(changeSetId: string, fileChangeId: string) {
    return this.decideFile(changeSetId, fileChangeId, "accept");
  }

  async rejectFile(changeSetId: string, fileChangeId: string) {
    return this.decideFile(changeSetId, fileChangeId, "reject");
  }

  async acceptHunk(changeSetId: string, fileChangeId: string, hunkId: string) {
    return this.decideHunk(changeSetId, fileChangeId, hunkId, "accept");
  }

  async rejectHunk(changeSetId: string, fileChangeId: string, hunkId: string) {
    return this.decideHunk(changeSetId, fileChangeId, hunkId, "reject");
  }

  async undo(changeSetId: string, scope: ReviewDecisionScope, fileChangeId?: string, hunkId?: string) {
    const changeSet = this.requireSet(changeSetId);
    if (scope === "hunk" && fileChangeId && hunkId) return this.undoHunk(changeSet, fileChangeId, hunkId);
    if (scope === "file" && fileChangeId) return this.undoFile(changeSet, fileChangeId);
    return this.undoAll(changeSet);
  }

  async resolveConflict(changeSetId: string, fileChangeId: string, action: ReviewConflictAction) {
    const changeSet = this.requireSet(changeSetId);
    const file = requireFile(changeSet, fileChangeId);
    const current = await this.files.read(file.path);
    const resolved = resolveConflictContent(file, current, action);
    if ("conflict" in resolved) {
      return this.fail(changeSet, "Unable to apply that conflict action automatically.", true);
    }
    await this.writeResolved(file, resolved.content, resolved.deleteFile);
    const status = action === "keep-current" || action === "use-ai" ? "accepted" as const : "rejected" as const;
    file.status = status;
    file.hunks = file.hunks.map((hunk) => hunk.status === "conflicted" || hunk.status === "pending" ? { ...hunk, status } : hunk);
    file.currentHash = await reviewHash(resolved.content);
    this.emit("file-change-accepted", this.base(changeSet, file, { decision: status === "accepted" ? "accept" : "reject", result: "ok" }));
    return this.commit(changeSet, "all", status === "accepted" ? "accept" : "reject");
  }

  async refreshHashes(changeSet: AiChangeSet) {
    const next = cloneChangeSet(changeSet);
    for (const file of next.files) {
      const current = file.kind === "deleted" ? await this.files.read(file.path) : await this.files.read(file.path);
      file.currentHash = await reviewHash(current);
      const relation = relationFromHashes(file.currentHash, file);
      if (relation === "human" && file.status === "pending") file.status = "conflicted";
    }
    return this.commitSet(withRolledStatus(next));
  }

  private async decideAll(changeSetId: string, decision: "accept" | "reject") {
    if (decision === "accept") return this.acceptAllAi(changeSetId);
    const changeSet = this.requireSet(changeSetId);
    for (const file of changeSet.files) {
      if (file.status === "accepted" || file.status === "rejected" || file.status === "superseded") continue;
      const result = await this.applyFileDecision(changeSet, file, decision, true);
      if (!result.ok) return result;
    }
    this.emit("change-set-rejected", this.base(changeSet, undefined, { decision, result: "ok" }));
    const committed = await this.commit(changeSet, "all", decision);
    if (committed.changeSet.files.every((file) => file.status === "accepted" || file.status === "rejected")
      && !committed.changeSet.files.some((file) => file.status === "conflicted")) {
      this.emit("review-completed", {
        ...this.base(committed.changeSet, undefined, { decision, result: "ok" }),
        accepted: committed.changeSet.files.filter((file) => file.status === "accepted").length,
        rejected: committed.changeSet.files.filter((file) => file.status === "rejected").length,
        partial: committed.changeSet.files.filter((file) => file.status === "partially-accepted").length,
        conflicted: committed.changeSet.files.filter((file) => file.status === "conflicted").length,
      } as AgentEvent);
    }
    return committed;
  }

  private async acceptAllAi(changeSetId: string) {
    const changeSet = this.requireSet(changeSetId);
    let failReason: string | undefined;
    for (const file of changeSet.files) {
      if (file.status === "accepted" || file.status === "rejected" || file.status === "superseded") continue;
      const result = await this.applyAiVersion(changeSet, file);
      if (!result.ok) failReason = result.reason ?? "Unable to apply the AI version.";
    }
    const conflicted = changeSet.files.filter((file) => file.status === "conflicted");
    if (conflicted.length === 0) {
      this.emit("change-set-accepted", this.base(changeSet, undefined, { decision: "accept", result: "ok" }));
    }
    const committed = await this.commit(changeSet, "all", "accept", undefined, undefined, conflicted.length > 0, failReason);
    if (committed.changeSet.files.every((file) => file.status === "accepted" || file.status === "rejected")
      && !committed.changeSet.files.some((file) => file.status === "conflicted")) {
      this.emit("review-completed", {
        ...this.base(committed.changeSet, undefined, { decision: "accept", result: "ok" }),
        accepted: committed.changeSet.files.filter((file) => file.status === "accepted").length,
        rejected: committed.changeSet.files.filter((file) => file.status === "rejected").length,
        partial: committed.changeSet.files.filter((file) => file.status === "partially-accepted").length,
        conflicted: 0,
      } as AgentEvent);
    }
    return committed;
  }

  private markFileConflicted(file: AiFileChange) {
    file.status = "conflicted";
    for (const hunk of file.hunks) {
      if (hunk.status === "pending" || hunk.status === "conflicted") hunk.status = "conflicted";
    }
  }

  private async applyAiVersion(changeSet: AiChangeSet, file: AiFileChange): Promise<ReviewOperationResult> {
    const current = await this.files.read(file.path);
    const resolved = resolveConflictContent(file, current, "use-ai");
    if ("conflict" in resolved) {
      this.markFileConflicted(file);
      this.emit("review-conflict-detected", this.base(changeSet, file, { decision: "accept", result: "conflict" }));
      await this.commitSet(changeSet);
      return this.fail(changeSet, resolved.reason, true);
    }
    try {
      await this.writeResolved(file, resolved.content, resolved.deleteFile);
    } catch {
      this.markFileConflicted(file);
      this.emit("review-conflict-detected", this.base(changeSet, file, { decision: "accept", result: "conflict" }));
      await this.commitSet(changeSet);
      return this.fail(changeSet, "Unable to write the AI version.", true);
    }
    for (const hunk of file.hunks) {
      if (hunk.status === "pending" || hunk.status === "conflicted") {
        hunk.status = "accepted";
        hunk.reviewedAt = this.now();
        hunk.reviewedBy = "user";
      }
    }
    file.status = file.hunks.some((hunk) => hunk.status === "rejected") ? "partially-accepted" : "accepted";
    file.currentHash = await reviewHash(resolved.content);
    return this.ok(changeSet);
  }

  private async decideFile(changeSetId: string, fileChangeId: string, decision: "accept" | "reject") {
    const changeSet = this.requireSet(changeSetId);
    const file = requireFile(changeSet, fileChangeId);
    const result = await this.applyFileDecision(changeSet, file, decision, true);
    if (!result.ok) return result;
    this.emit(decision === "accept" ? "file-change-accepted" : "file-change-rejected", this.base(changeSet, file, { decision, result: "ok" }));
    return this.commit(changeSet, "file", decision, file.id);
  }

  private async decideHunk(changeSetId: string, fileChangeId: string, hunkId: string, decision: "accept" | "reject") {
    const changeSet = this.requireSet(changeSetId);
    const file = requireFile(changeSet, fileChangeId);
    const hunk = file.hunks.find((item) => item.id === hunkId);
    if (!hunk) return this.fail(changeSet, "Hunk not found.");
    if (hunk.status !== "pending" && hunk.status !== "conflicted") {
      return this.ok(changeSet);
    }
    const current = await this.files.read(file.path);
    const relation = await classifyContent(current, file);
    if (decision === "accept") {
      if (relation === "human") {
        hunk.status = "conflicted";
        file.status = "conflicted";
        this.emit("review-conflict-detected", this.base(changeSet, file, { hunkId, decision, result: "conflict" }));
        return this.commit(changeSet, "hunk", decision, file.id, hunk.id, true, "Human edits overlap this hunk.");
      }
      hunk.status = "accepted";
      hunk.reviewedAt = this.now();
      hunk.reviewedBy = "user";
      this.emit("change-hunk-accepted", this.base(changeSet, file, { hunkId, decision, result: "ok" }));
      return this.commit(changeSet, "hunk", decision, file.id, hunk.id);
    }
    if (file.binary || file.tooLarge) {
      return this.applyFileDecision(changeSet, file, "reject", true);
    }
    if (current === null && file.kind === "created") {
      const remaining = file.hunks.filter((item) => item.id !== hunk.id && item.status !== "rejected");
      if (remaining.length === 0) return this.applyFileDecision(changeSet, file, "reject", true);
    }
    if (current === null) {
      hunk.status = "conflicted";
      file.status = "conflicted";
      return this.commit(changeSet, "hunk", decision, file.id, hunk.id, true, "File is missing.");
    }
    const applied = applyReverse(current, hunk);
    if (!applied.ok) {
      hunk.status = "conflicted";
      file.status = "conflicted";
      this.emit("review-conflict-detected", this.base(changeSet, file, { hunkId, decision, result: "conflict", error: applied.reason }));
      return this.commit(changeSet, "hunk", decision, file.id, hunk.id, true, applied.reason);
    }
    await this.files.write(file.path, applied.content);
    file.currentHash = await reviewHash(applied.content);
    hunk.status = "rejected";
    hunk.reviewedAt = this.now();
    hunk.reviewedBy = "user";
    this.emit("change-hunk-rejected", this.base(changeSet, file, { hunkId, decision, result: "ok" }));
    await this.maybeDeleteCreated(file);
    return this.commit(changeSet, "hunk", decision, file.id, hunk.id);
  }

  private async applyFileDecision(changeSet: AiChangeSet, file: AiFileChange, decision: "accept" | "reject", pendingOnly: boolean): Promise<ReviewOperationResult> {
    const current = await this.files.read(file.path);
    const relation = await classifyContent(current, file);
    if (decision === "accept") {
      if (relation === "human") {
        file.status = "conflicted";
        this.emit("review-conflict-detected", this.base(changeSet, file, { decision, result: "conflict" }));
        await this.commitSet(changeSet);
        return this.fail(changeSet, "The file was modified outside the agent proposal.", true);
      }
      for (const hunk of file.hunks) {
        if (!pendingOnly || hunk.status === "pending" || hunk.status === "conflicted") {
          hunk.status = "accepted";
          hunk.reviewedAt = this.now();
          hunk.reviewedBy = "user";
        }
      }
      file.status = file.hunks.some((hunk) => hunk.status === "rejected") ? "partially-accepted" : "accepted";
      file.currentHash = await reviewHash(current);
      return this.ok(changeSet);
    }
    return this.rejectFileContents(changeSet, file, current, relation, pendingOnly);
  }

  private async rejectFileContents(
    changeSet: AiChangeSet,
    file: AiFileChange,
    current: string | null,
    relation: FileRelation,
    pendingOnly: boolean,
  ): Promise<ReviewOperationResult> {
    const pendingHunks = file.hunks.filter((hunk) => !pendingOnly || hunk.status === "pending" || hunk.status === "conflicted");
    if (file.kind === "created" && !file.previousPath) {
      if (relation === "human") {
        file.status = "conflicted";
        return this.fail(changeSet, "The new file was edited by a human.", true);
      }
      if (current !== null) await this.files.delete(file.path);
      file.currentHash = ABSENT_HASH;
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = file.hunks.some((hunk) => hunk.status === "accepted") ? "partially-accepted" : "rejected";
      return this.ok(changeSet);
    }
    if (file.kind === "deleted") {
      if (current !== null && relation === "human") {
        file.status = "conflicted";
        return this.fail(changeSet, "The deleted path was reused.", true);
      }
      if (file.baseContent !== null && file.baseContent !== undefined) {
        await this.files.write(file.path, file.baseContent);
        file.currentHash = file.baseHash;
      }
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = "rejected";
      return this.ok(changeSet);
    }
    if (file.kind === "renamed" && file.previousPath) {
      if (relation === "human") {
        file.status = "conflicted";
        return this.fail(changeSet, "The renamed file was edited by a human.", true);
      }
      const destinationBusy = await this.files.read(file.previousPath);
      if (destinationBusy !== null) {
        file.status = "conflicted";
        return this.fail(changeSet, "The original path already exists.", true);
      }
      if (current !== null) {
        if (this.files.rename) await this.files.rename(file.path, file.previousPath);
        else {
          await this.files.write(file.previousPath, current);
          await this.files.delete(file.path);
        }
      } else if (file.baseContent !== null && file.baseContent !== undefined) {
        await this.files.write(file.previousPath, file.baseContent);
      }
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = "rejected";
      return this.ok(changeSet);
    }
    if (relation === "human") {
      if (pendingHunks.length === 0) return this.ok(changeSet);
      if (current === null) {
        file.status = "conflicted";
        return this.fail(changeSet, "The file was deleted outside the review.", true);
      }
      const applied = applyHunks(current, pendingHunks, "reverse");
      if (!applied.ok) {
        file.status = "conflicted";
        this.emit("review-conflict-detected", this.base(changeSet, file, { decision: "reject", result: "conflict", error: applied.reason }));
        return this.fail(changeSet, applied.reason, true);
      }
      await this.files.write(file.path, applied.content);
      file.currentHash = await reviewHash(applied.content);
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = file.hunks.some((hunk) => hunk.status === "accepted") ? "partially-accepted" : "rejected";
      return this.ok(changeSet);
    }
    if (relation === "matches-proposed" || relation === "missing") {
      if (file.baseContent === null || file.baseHash === ABSENT_HASH) {
        if (current !== null) await this.files.delete(file.path);
        file.currentHash = ABSENT_HASH;
      } else {
        await this.files.write(file.path, file.baseContent ?? "");
        file.currentHash = file.baseHash;
      }
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = file.hunks.some((hunk) => hunk.status === "accepted") ? "partially-accepted" : "rejected";
      return this.ok(changeSet);
    }
    if (relation === "matches-base") {
      for (const hunk of pendingHunks) markRejected(hunk, this.now());
      file.status = file.hunks.some((hunk) => hunk.status === "accepted") ? "partially-accepted" : "rejected";
      return this.ok(changeSet);
    }
    file.status = "conflicted";
    return this.fail(changeSet, "Unable to reject this file safely.", true);
  }

  private async undoHunk(changeSet: AiChangeSet, fileChangeId: string, hunkId: string) {
    const file = requireFile(changeSet, fileChangeId);
    const hunk = file.hunks.find((item) => item.id === hunkId);
    if (!hunk || hunk.status === "pending") return this.ok(changeSet);
    const current = await this.files.read(file.path);
    if (hunk.status === "accepted") {
      hunk.status = "pending";
      hunk.reviewedAt = undefined;
      this.emit("review-decision-undone", this.base(changeSet, file, { hunkId, decision: "undo", result: "ok" }));
      return this.commit(changeSet, "hunk", "undo", file.id, hunk.id);
    }
    if (current === null && file.kind === "created") {
      if (file.proposedContent !== null && file.proposedContent !== undefined) {
        await this.files.write(file.path, file.proposedContent);
        file.currentHash = file.proposedHash;
      }
      hunk.status = "pending";
      this.emit("review-decision-undone", this.base(changeSet, file, { hunkId, decision: "undo", result: "ok" }));
      return this.commit(changeSet, "hunk", "undo", file.id, hunk.id);
    }
    if (current === null) return this.fail(changeSet, "The file is missing.", true);
    const applied = applyForward(current, hunk);
    if (!applied.ok) {
      hunk.status = "conflicted";
      file.status = "conflicted";
      return this.commit(changeSet, "hunk", "undo", file.id, hunk.id, true, applied.reason);
    }
    await this.files.write(file.path, applied.content);
    file.currentHash = await reviewHash(applied.content);
    hunk.status = "pending";
    hunk.reviewedAt = undefined;
    this.emit("review-decision-undone", this.base(changeSet, file, { hunkId, decision: "undo", result: "ok" }));
    return this.commit(changeSet, "hunk", "undo", file.id, hunk.id);
  }

  private async undoFile(changeSet: AiChangeSet, fileChangeId: string) {
    const file = requireFile(changeSet, fileChangeId);
    for (const hunk of [...file.hunks].reverse()) {
      if (hunk.status === "pending") continue;
      const result = await this.undoHunk(changeSet, file.id, hunk.id);
      if (!result.ok) return result;
    }
    if (file.hunks.length === 0) {
      if (file.status === "rejected") {
        const restored = await this.applyFileDecision(changeSet, file, "accept", false);
        if (!restored.ok) return restored;
        if (file.kind === "created" && file.proposedContent) {
          await this.files.write(file.path, file.proposedContent);
        }
        if (file.kind === "deleted" && await this.files.read(file.path) !== null) {
          await this.files.delete(file.path);
        }
      }
      file.status = "pending";
    }
    this.emit("review-decision-undone", this.base(changeSet, file, { decision: "undo", result: "ok" }));
    return this.commit(changeSet, "file", "undo", file.id);
  }

  private async undoAll(changeSet: AiChangeSet) {
    for (const file of [...changeSet.files].reverse()) {
      const result = await this.undoFile(changeSet, file.id);
      if (!result.ok) return result;
    }
    this.emit("review-decision-undone", this.base(changeSet, undefined, { decision: "undo", result: "ok" }));
    return this.commit(changeSet, "all", "undo");
  }

  private async maybeDeleteCreated(file: AiFileChange) {
    if (file.kind !== "created") return;
    if (file.hunks.some((hunk) => hunk.status === "accepted" || hunk.status === "pending")) return;
    const current = await this.files.read(file.path);
    if (current === null) return;
    const relation = await classifyContent(current, file);
    if (relation === "human") return;
    await this.files.delete(file.path);
    file.currentHash = ABSENT_HASH;
  }

  private async writeResolved(file: AiFileChange, content: string | null, deleteFile: boolean) {
    if (deleteFile || content === null) {
      const current = await this.files.read(file.path);
      if (current !== null) await this.files.delete(file.path);
      return;
    }
    await this.files.write(file.path, content);
  }

  private requireSet(id: string) {
    const changeSet = this.tracking.get(id);
    if (!changeSet) throw new Error("Change set not found.");
    return changeSet;
  }

  private async commit(
    changeSet: AiChangeSet,
    scope: ReviewDecisionScope,
    decision: ReviewDecisionKind,
    fileChangeId?: string,
    hunkId?: string,
    conflict = false,
    reason?: string,
  ): Promise<ReviewOperationResult> {
    const next = await this.commitSet(changeSet);
    const record: AiReviewDecision = {
      id: this.id(),
      changeSetId: next.id,
      fileChangeId,
      hunkId,
      scope,
      decision,
      createdAt: this.now(),
    };
    await this.persist?.saveDecision(record);
    return { ok: !conflict, conflict, reason, changeSet: next };
  }

  private async commitSet(changeSet: AiChangeSet) {
    const next = withRolledStatus({ ...changeSet, updatedAt: this.now() });
    if (next.status === "accepted" || next.status === "rejected") next.completedAt = this.now();
    this.tracking.replace(next);
    await this.persist?.save(next);
    return next;
  }

  private ok(changeSet: AiChangeSet): ReviewOperationResult {
    return { ok: true, changeSet };
  }

  private fail(changeSet: AiChangeSet, reason: string, conflict = false): ReviewOperationResult {
    this.tracking.replace(changeSet);
    return { ok: false, conflict, reason, changeSet };
  }

  private base(changeSet: AiChangeSet, file?: AiFileChange, extra: Partial<ReviewEventBase> = {}): ReviewEventBase {
    return {
      accountId: changeSet.accountId,
      projectId: changeSet.projectId,
      runId: changeSet.runId,
      changeSetId: changeSet.id,
      fileChangeId: file?.id,
      path: file?.path,
      ...extra,
    };
  }

  private emit(type: AgentEvent["type"], payload: ReviewEventBase | AgentEvent) {
    this.emitFn?.({ type, ...payload } as AgentEvent);
  }
}

function requireFile(changeSet: AiChangeSet, fileChangeId: string) {
  const file = changeSet.files.find((item) => item.id === fileChangeId);
  if (!file) throw new Error("File change not found.");
  return file;
}

function markRejected(hunk: AiChangeSet["files"][number]["hunks"][number], now: number) {
  hunk.status = "rejected";
  hunk.reviewedAt = now;
  hunk.reviewedBy = "user";
}
