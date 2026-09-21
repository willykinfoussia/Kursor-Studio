import { Check } from "lucide-react";
import { useReviewStore } from "../../../stores/reviewStore";

export function ReviewSummaryBlock({
  changeSetId,
  accepted,
  rejected,
  partial,
  conflicted,
}: {
  changeSetId: string;
  accepted: number;
  rejected: number;
  partial: number;
  conflicted: number;
}) {
  const openReview = useReviewStore((state) => state.openReview);
  return (
    <div className="tool-activity completion-block">
      <div className="tool-activity-line">
        <Check size={13} className="status-glyph success" />
        <span className="tool-activity-title">Changes reviewed</span>
      </div>
      <ul className="completion-facts">
        {accepted > 0 ? <li>{accepted} file{accepted === 1 ? "" : "s"} accepted</li> : null}
        {partial > 0 ? <li>{partial} file{partial === 1 ? "" : "s"} partially accepted</li> : null}
        {rejected > 0 ? <li>{rejected} file{rejected === 1 ? "" : "s"} rejected</li> : null}
        {conflicted > 0 ? <li>{conflicted} conflict{conflicted === 1 ? "" : "s"}</li> : null}
      </ul>
      <button type="button" className="text-link" onClick={() => openReview(changeSetId)}>Open review</button>
    </div>
  );
}
