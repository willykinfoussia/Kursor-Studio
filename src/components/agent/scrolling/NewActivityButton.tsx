import { ArrowDown } from "lucide-react";

export function NewActivityButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="new-activity-btn" onClick={onClick} aria-label="Jump to new activity">
      <ArrowDown size={12} />
      New activity
    </button>
  );
}
