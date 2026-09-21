import { ChevronDown } from "lucide-react";
import type { ChangePath, PresentationState } from "../../../lib/agent/conversation";
import { useEditorStore } from "../../../stores/editorStore";
import { useGitStore } from "../../../stores/gitStore";
import { useUiStore } from "../../../stores/uiStore";

export function ChangesBlock({
  paths,
  presentation,
  onToggle,
}: {
  paths: ChangePath[];
  presentation: PresentationState;
  onToggle: () => void;
}) {
  const detailsId = "changes-details";
  const openDiff = (path: string) => {
    useUiStore.getState().setView("github");
    void useGitStore.getState().selectFile(path);
  };

  return (
    <div className="tool-activity">
      <button
        type="button"
        className="tool-activity-line"
        onClick={onToggle}
        aria-expanded={presentation.expanded}
        aria-controls={detailsId}
      >
        <span className="tool-activity-title">Edited {paths.length} file{paths.length === 1 ? "" : "s"}</span>
        <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
      </button>
      {presentation.expanded && (
        <div id={detailsId} className="tool-group-details">
          <ul className="changes-list">
            {paths.map((row) => (
              <li key={`${row.flag}-${row.path}`}>
                <button
                  type="button"
                  className="changed-file"
                  onClick={() => void useEditorStore.getState().openFile(row.path)}
                >
                  <span className={`change-flag ${row.flag}`}>{row.flag}</span>
                  {row.path}
                </button>
              </li>
            ))}
          </ul>
          <div className="tool-detail-actions">
            <button
              type="button"
              className="text-link"
              onClick={() => {
                const path = paths[0]?.path;
                if (path) openDiff(path);
                else useUiStore.getState().setView("github");
              }}
            >
              Open diff
            </button>
            {paths[0] && (
              <button type="button" className="text-link" onClick={() => useUiStore.getState().setView("project")}>
                View in Explorer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
