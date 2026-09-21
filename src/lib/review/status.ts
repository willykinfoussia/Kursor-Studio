import type { AiChangeSet, AiFileChange, ChangeReviewStatus, ChangeSetStatus, HunkReviewStatus } from "./types";

export function rollupHunks(statuses: HunkReviewStatus[]): ChangeReviewStatus {
  if (statuses.length === 0) return "pending";
  if (statuses.some((status) => status === "conflicted")) return "conflicted";
  const pending = statuses.filter((status) => status === "pending").length;
  const accepted = statuses.filter((status) => status === "accepted").length;
  const rejected = statuses.filter((status) => status === "rejected").length;
  if (pending === statuses.length) return "pending";
  if (accepted === statuses.length) return "accepted";
  if (rejected === statuses.length) return "rejected";
  return "partially-accepted";
}

export function rollupFile(file: AiFileChange): ChangeReviewStatus {
  if (file.status === "superseded") return "superseded";
  if (file.binary || file.tooLarge || file.hunks.length === 0) return file.status;
  return rollupHunks(file.hunks.map((hunk) => hunk.status));
}

export function rollupChangeSet(files: AiFileChange[]): ChangeSetStatus {
  if (files.length === 0) return "active";
  if (files.some((file) => file.status === "conflicted" || file.status === "superseded")) return "conflicted";
  const pending = files.filter((file) => file.status === "pending").length;
  const accepted = files.filter((file) => file.status === "accepted").length;
  const rejected = files.filter((file) => file.status === "rejected").length;
  if (pending === files.length) return "pending-review";
  if (accepted === files.length) return "accepted";
  if (rejected === files.length) return "rejected";
  return "partially-reviewed";
}

export function withRolledStatus(changeSet: AiChangeSet): AiChangeSet {
  const files = changeSet.files.map((file) => ({ ...file, status: rollupFile(file) }));
  const status = changeSet.status === "active" && files.every((file) => file.status === "pending")
    ? "active"
    : rollupChangeSet(files);
  return {
    ...changeSet,
    files,
    status: changeSet.status === "active" && status === "pending-review" ? "active" : status,
  };
}
