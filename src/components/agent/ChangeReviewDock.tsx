import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { changeSetStats } from "../../lib/review";
import { VirtualList } from "../git/VirtualList";
import { activeReviewChangeSet, useReviewStore } from "../../stores/reviewStore";
import { agentRuntime } from "../../lib/agent/AgentRuntime";
import { useAgentStore } from "../../stores/agentStore";

export function ChangeReviewDock() {
  const changeSets = useReviewStore((state) => state.changeSets);
  const expanded = useReviewStore((state) => state.dockExpanded);
  const setExpanded = useReviewStore((state) => state.setDockExpanded);
  const openReview = useReviewStore((state) => state.openReview);
  const acceptAll = useReviewStore((state) => state.acceptAll);
  const writingPath = useReviewStore((state) => state.writingPath);
  const streaming = useAgentStore((state) => state.isStreaming);
  const changeSet = useReviewStore(activeReviewChangeSet) ?? changeSets[0] ?? null;
  const stats = useMemo(() => changeSet ? changeSetStats(changeSet) : null, [changeSet]);

  if (!changeSet || changeSet.files.length === 0) return null;
  const pending = changeSet.status === "active" || changeSet.status === "pending-review" || changeSet.status === "partially-reviewed" || changeSet.status === "conflicted";
  if (!pending) return null;

  const countLabel = `${stats?.files ?? changeSet.files.length} File${(stats?.files ?? 1) === 1 ? "" : "s"}`;
  const done = !streaming && changeSet.status !== "active";

  return (
    <div className="change-review-dock" aria-label="AI file changes">
      <div className="change-review-bar">
        <button
          type="button"
          className="change-review-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={12} className={expanded ? "open" : ""} />
          <span>{done ? `${countLabel} changed` : countLabel}</span>
        </button>
        <span className="change-review-counts" aria-label={`${stats?.additions ?? 0} additions, ${stats?.deletions ?? 0} deletions`}>
          <span className="add">+{stats?.additions ?? 0}</span>
          <span className="del">-{stats?.deletions ?? 0}</span>
        </span>
        <span className="change-review-actions">
          {streaming && (
            <button type="button" className="stop-btn" onClick={() => agentRuntime.cancel()}>Stop</button>
          )}
          <button
            type="button"
            className="review-open-btn"
            disabled={streaming}
            onClick={() => {
              useReviewStore.setState({ activeChangeSetId: changeSet.id });
              void acceptAll();
            }}
          >
            Accept all
          </button>
          <button type="button" className="review-open-btn" onClick={() => openReview(changeSet.id)}>Review</button>
        </span>
      </div>
      {expanded && (
        <VirtualList
          className="change-review-files"
          items={changeSet.files}
          itemHeight={22}
          renderItem={(file) => (
            <button
              type="button"
              className={`change-review-file${writingPath === file.path ? " active" : ""}`}
              onClick={() => openReview(changeSet.id, file.id)}
            >
              <span className="name">{file.path}</span>
              <span className="add">+{file.additions}</span>
              <span className="del">-{file.deletions}</span>
            </button>
          )}
        />
      )}
    </div>
  );
}
