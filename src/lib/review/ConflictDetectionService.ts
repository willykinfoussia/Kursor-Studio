import { ABSENT_HASH, type AiFileChange, type ReviewConflictAction } from "./types";
import { reviewHash } from "./hash";

export type FileRelation = "matches-proposed" | "matches-base" | "human" | "missing";

export function relationFromHashes(current: string, file: Pick<AiFileChange, "baseHash" | "proposedHash">): FileRelation {
  if (current === ABSENT_HASH) return file.proposedHash === ABSENT_HASH ? "matches-proposed" : "missing";
  if (file.proposedHash && current === file.proposedHash) return "matches-proposed";
  if (file.baseHash && current === file.baseHash) return "matches-base";
  return "human";
}

export async function classifyContent(
  content: string | null,
  file: Pick<AiFileChange, "baseHash" | "proposedHash">,
): Promise<FileRelation> {
  return relationFromHashes(await reviewHash(content), file);
}

export function resolveConflictContent(
  file: AiFileChange,
  current: string | null,
  action: ReviewConflictAction,
): { content: string | null; deleteFile: boolean } | { conflict: true; reason: string } {
  if (action === "open-merge") return { conflict: true, reason: "Open the merge editor to resolve this file." };
  if (action === "keep-current") return { content: current, deleteFile: current === null };
  if (action === "use-ai") {
    if (file.kind === "deleted") return { content: null, deleteFile: true };
    return { content: file.proposedContent ?? current, deleteFile: false };
  }
  if (file.kind === "created") return { content: null, deleteFile: true };
  return { content: file.baseContent ?? "", deleteFile: false };
}

export function isUnsafeOverwrite(relation: FileRelation, operation: "accept" | "reject" | "undo") {
  if (relation === "human") return true;
  if (operation === "reject" && relation === "missing" && false) return true;
  return false;
}
