import { databaseApi } from "../tauri/databaseApi";
import { isTauri } from "../tauri/invoke";
import type {
  AiChangeSet,
  AiFileChange,
  AiReviewDecision,
  ChangeReviewStatus,
  ChangeSetStatus,
  FileChangeKind,
  HunkReviewStatus,
} from "../review/types";
import type { AiChangeSetRecord, AiFileChangeRecord, AiReviewDecisionRecord } from "./types";

export const aiChangeRepository = {
  async save(changeSet: AiChangeSet) {
    if (!isTauri()) return;
    await databaseApi.aiChangeSetsSave(toRecord(changeSet));
  },
  async get(id: string): Promise<AiChangeSet | null> {
    if (!isTauri()) return null;
    const record = await databaseApi.aiChangeSetsGet(id);
    return record ? fromRecord(record) : null;
  },
  async listOpen(projectId: string): Promise<AiChangeSet[]> {
    if (!isTauri()) return [];
    const records = await databaseApi.aiChangeSetsListOpen(projectId);
    return records.map(fromRecord);
  },
  async saveDecision(decision: AiReviewDecision) {
    if (!isTauri()) return;
    await databaseApi.aiReviewDecisionsInsert(toDecision(decision));
  },
};

export const serializeAiChangeSet = toRecord;
export const deserializeAiChangeSet = fromRecord;

function toRecord(changeSet: AiChangeSet): AiChangeSetRecord {
  return {
    id: changeSet.id,
    accountId: changeSet.accountId,
    projectId: changeSet.projectId,
    runId: changeSet.runId,
    conversationId: changeSet.conversationId ?? null,
    agentId: changeSet.agentId ?? null,
    model: changeSet.model ?? null,
    status: changeSet.status,
    createdAt: changeSet.createdAt,
    updatedAt: changeSet.updatedAt,
    completedAt: changeSet.completedAt ?? null,
    files: changeSet.files.map((file, index) => toFileRecord(file, index)),
  };
}

function toFileRecord(file: AiFileChange, _index: number): AiFileChangeRecord {
  return {
    id: file.id,
    changeSetId: file.changeSetId,
    path: file.path,
    previousPath: file.previousPath ?? null,
    kind: file.kind,
    baseHash: file.baseHash ?? null,
    proposedHash: file.proposedHash ?? null,
    currentHash: file.currentHash ?? null,
    baseContent: file.baseContent ?? null,
    proposedContent: file.proposedContent ?? null,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status,
    binary: file.binary ? 1 : 0,
    tooLarge: file.tooLarge ? 1 : 0,
    toolCallIdsJson: JSON.stringify(file.toolCallIds),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    hunks: file.hunks.map((hunk, hunkIndex) => ({
      id: hunk.id,
      fileChangeId: hunk.fileChangeId,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      originalText: hunk.originalText,
      proposedText: hunk.proposedText,
      patch: hunk.patch,
      reversePatch: hunk.reversePatch ?? null,
      status: hunk.status,
      toolCallId: hunk.toolCallId ?? null,
      hunkIndex,
      createdAt: hunk.createdAt,
      reviewedAt: hunk.reviewedAt ?? null,
      reviewedBy: hunk.reviewedBy ?? null,
    })),
  };
}

function fromRecord(record: AiChangeSetRecord): AiChangeSet {
  return {
    id: record.id,
    accountId: record.accountId ?? "",
    projectId: record.projectId,
    runId: record.runId,
    conversationId: record.conversationId ?? undefined,
    agentId: record.agentId ?? undefined,
    model: record.model ?? undefined,
    status: record.status as ChangeSetStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? undefined,
    files: (record.files ?? []).map(fromFileRecord),
  };
}

function fromFileRecord(record: AiFileChangeRecord): AiFileChange {
  let toolCallIds: string[] = [];
  if (record.toolCallIdsJson) {
    try {
      const parsed = JSON.parse(record.toolCallIdsJson) as unknown;
      if (Array.isArray(parsed)) toolCallIds = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      toolCallIds = [];
    }
  }
  return {
    id: record.id,
    changeSetId: record.changeSetId,
    path: record.path,
    previousPath: record.previousPath ?? undefined,
    kind: record.kind as FileChangeKind,
    baseHash: record.baseHash ?? undefined,
    proposedHash: record.proposedHash ?? undefined,
    currentHash: record.currentHash ?? undefined,
    baseContent: record.baseContent ?? undefined,
    proposedContent: record.proposedContent ?? undefined,
    additions: record.additions,
    deletions: record.deletions,
    status: record.status as ChangeReviewStatus,
    binary: record.binary === 1,
    tooLarge: record.tooLarge === 1,
    hunks: (record.hunks ?? []).map((hunk) => ({
      id: hunk.id,
      fileChangeId: hunk.fileChangeId,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      originalText: hunk.originalText,
      proposedText: hunk.proposedText,
      patch: hunk.patch,
      reversePatch: hunk.reversePatch ?? undefined,
      status: hunk.status as HunkReviewStatus,
      toolCallId: hunk.toolCallId ?? undefined,
      createdAt: hunk.createdAt,
      reviewedAt: hunk.reviewedAt ?? undefined,
      reviewedBy: hunk.reviewedBy === "policy" ? "policy" : hunk.reviewedBy === "user" ? "user" : undefined,
    })),
    toolCallIds,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toDecision(decision: AiReviewDecision): AiReviewDecisionRecord {
  return {
    id: decision.id,
    changeSetId: decision.changeSetId,
    fileChangeId: decision.fileChangeId ?? null,
    hunkId: decision.hunkId ?? null,
    scope: decision.scope,
    decision: decision.decision,
    createdAt: decision.createdAt,
  };
}
