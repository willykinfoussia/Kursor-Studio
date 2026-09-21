import { Check, ChevronDown } from "lucide-react";
import type { PresentationState } from "../../../lib/agent/conversation";
import { useReviewStore } from "../../../stores/reviewStore";

export function CompletionBlock({
  summary,
  filesChanged,
  verificationOk,
  testsHint,
  presentation,
  onToggle,
}: {
  summary: string;
  filesChanged?: number;
  verificationOk?: boolean;
  testsHint?: string;
  presentation: PresentationState;
  onToggle: () => void;
}) {
  const detailsId = "completion-details";
  const openReview = useReviewStore((state) => state.openReview);
  return (
    <div className="tool-activity completion-block">
      <button
        type="button"
        className="tool-activity-line"
        onClick={onToggle}
        aria-expanded={presentation.expanded}
        aria-controls={detailsId}
      >
        <Check size={13} className="status-glyph success" />
        <span className="tool-activity-title">Task completed</span>
        <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
      </button>
      {presentation.expanded && (
        <div id={detailsId} className="tool-group-details">
          <p className="completion-summary">{summary}</p>
          <ul className="completion-facts">
            {filesChanged ? <li>{filesChanged} files changed</li> : null}
            {testsHint ? <li>{testsHint}</li> : null}
            {verificationOk === true ? <li>Build successful</li> : null}
            {verificationOk === false ? <li>Verification failed</li> : null}
          </ul>
          {filesChanged ? <button type="button" className="text-link" onClick={() => openReview()}>Review changes</button> : null}
        </div>
      )}
    </div>
  );
}
