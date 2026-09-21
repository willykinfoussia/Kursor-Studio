import { Check, Circle, CircleDot, FileMinus, FilePlus, MinusCircle, TriangleAlert } from "lucide-react";
import type { ChangeReviewStatus, FileChangeKind, HunkReviewStatus } from "../../lib/review";

export function ReviewStatusIcon({
  status,
  kind,
}: {
  status: ChangeReviewStatus | HunkReviewStatus;
  kind?: FileChangeKind;
}) {
  if (kind === "created") return <FilePlus size={12} aria-label="New file" />;
  if (kind === "deleted") return <FileMinus size={12} aria-label="Deleted file" />;
  if (status === "accepted") return <Check size={12} aria-label="Accepted" className="review-status accepted" />;
  if (status === "rejected") return <MinusCircle size={12} aria-label="Rejected" className="review-status rejected" />;
  if (status === "partially-accepted") return <CircleDot size={12} aria-label="Partially accepted" className="review-status partial" />;
  if (status === "conflicted" || status === "superseded") return <TriangleAlert size={12} aria-label="Conflict" className="review-status conflict" />;
  return <Circle size={12} aria-label="Pending" className="review-status pending" />;
}

export function reviewStatusLabel(status: ChangeReviewStatus | HunkReviewStatus) {
  if (status === "partially-accepted") return "Partially accepted";
  if (status === "superseded") return "Superseded";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
