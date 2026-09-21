export type ChangeSetStatus =
  | "active"
  | "pending-review"
  | "partially-reviewed"
  | "accepted"
  | "rejected"
  | "conflicted";

export type ChangeReviewStatus =
  | "pending"
  | "partially-accepted"
  | "accepted"
  | "rejected"
  | "conflicted"
  | "superseded";

export type HunkReviewStatus = "pending" | "accepted" | "rejected" | "conflicted";

export type FileChangeKind = "created" | "modified" | "deleted" | "renamed";

export type ReviewDecisionKind = "accept" | "reject" | "undo";

export type ReviewDecisionScope = "all" | "file" | "hunk";

export type ReviewConflictAction = "keep-current" | "use-ai" | "use-original" | "open-merge";

export type HunkFilter = "all" | "pending" | "accepted" | "rejected" | "conflicts";

export const ABSENT_HASH = "absent";
export const TEXT_BYTE_LIMIT = 1_048_576;
export const TEXT_LINE_LIMIT = 8_000;

export interface AiChangeHunk {
  id: string;
  fileChangeId: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  originalText: string;
  proposedText: string;
  patch: string;
  reversePatch?: string;
  status: HunkReviewStatus;
  toolCallId?: string;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: "user" | "policy";
}

export interface AiFileChange {
  id: string;
  changeSetId: string;
  path: string;
  previousPath?: string;
  kind: FileChangeKind;
  baseHash?: string;
  proposedHash?: string;
  currentHash?: string;
  baseContent?: string | null;
  proposedContent?: string | null;
  additions: number;
  deletions: number;
  status: ChangeReviewStatus;
  binary: boolean;
  tooLarge: boolean;
  hunks: AiChangeHunk[];
  toolCallIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AiChangeSet {
  id: string;
  accountId: string;
  projectId: string;
  runId: string;
  conversationId?: string;
  agentId?: string;
  model?: string;
  status: ChangeSetStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  files: AiFileChange[];
}

export interface AiReviewDecision {
  id: string;
  changeSetId: string;
  fileChangeId?: string;
  hunkId?: string;
  scope: ReviewDecisionScope;
  decision: ReviewDecisionKind;
  createdAt: number;
}

export interface ReviewEventBase {
  accountId?: string;
  projectId: string;
  runId: string;
  changeSetId: string;
  fileChangeId?: string;
  hunkId?: string;
  toolCallId?: string;
  path?: string;
  decision?: ReviewDecisionKind;
  result?: "ok" | "conflict" | "error";
  error?: string;
}

export interface ReviewFiles {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  isBinary(path: string): boolean;
}

export interface ChangeStore {
  save(changeSet: AiChangeSet): Promise<void>;
  get(id: string): Promise<AiChangeSet | null>;
  listOpen(projectId: string): Promise<AiChangeSet[]>;
  saveDecision(decision: AiReviewDecision): Promise<void>;
}

export type PatchApplyResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      reason: string;
    };

export interface ReviewOperationResult {
  ok: boolean;
  conflict?: boolean;
  reason?: string;
  changeSet: AiChangeSet;
}

export const OPEN_CHANGE_SET_STATUSES: ChangeSetStatus[] = [
  "active",
  "pending-review",
  "partially-reviewed",
  "conflicted",
];

export function isOpenChangeSetStatus(status: ChangeSetStatus) {
  return OPEN_CHANGE_SET_STATUSES.includes(status);
}

export function cloneChangeSet(changeSet: AiChangeSet): AiChangeSet {
  return {
    ...changeSet,
    files: changeSet.files.map((file) => ({
      ...file,
      toolCallIds: [...file.toolCallIds],
      hunks: file.hunks.map((hunk) => ({ ...hunk })),
    })),
  };
}

export function changeSetStats(changeSet: AiChangeSet) {
  let additions = 0;
  let deletions = 0;
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  let partial = 0;
  let conflicted = 0;
  for (const file of changeSet.files) {
    additions += file.additions;
    deletions += file.deletions;
    if (file.status === "pending") pending += 1;
    else if (file.status === "accepted") accepted += 1;
    else if (file.status === "rejected") rejected += 1;
    else if (file.status === "partially-accepted") partial += 1;
    else if (file.status === "conflicted" || file.status === "superseded") conflicted += 1;
  }
  return {
    files: changeSet.files.length,
    additions,
    deletions,
    pending,
    accepted,
    rejected,
    partial,
    conflicted,
  };
}
