import { useState } from "react";
import { isMissingProject } from "../../lib/project/ProjectService";
import { locateMissingProject, openListedProject, recreateMissingProject } from "../../lib/project/workspaceActions";
import { useProjectStore } from "../../stores/projectStore";
import type { Project } from "../../types/project";

export function ProjectListItem({
  project,
  current = false,
  showRemoveWhenPresent = false,
}: {
  project: Project;
  current?: boolean;
  showRemoveWhenPresent?: boolean;
}) {
  const removeProject = useProjectStore((state) => state.removeProject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = isMissingProject(project);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`home-recent-row${missing ? " missing" : ""}`}>
      <div className="home-recent-main">
        <button
          type="button"
          className="home-recent-open"
          disabled={missing || busy}
          onClick={() => void openListedProject(project)}
        >
          <strong>
            {project.name}
            {current ? " · open" : ""}
            {missing ? <span className="home-missing-badge">Folder missing</span> : null}
          </strong>
          <span>{project.rootPath}</span>
        </button>
        {!missing && showRemoveWhenPresent && (
          <div className="modal-actions home-recent-actions">
            <button
              type="button"
              className="modal-btn"
              disabled={busy}
              onClick={() => void run(() => removeProject(project.id))}
            >
              Remove from Kursor
            </button>
          </div>
        )}
      </div>
      {missing && (
        <div className="modal-actions home-recent-actions">
          <button
            type="button"
            className="modal-btn primary"
            disabled={busy}
            onClick={() => void run(() => recreateMissingProject(project))}
          >
            Recreate
          </button>
          <button
            type="button"
            className="modal-btn"
            disabled={busy}
            onClick={() => void run(() => locateMissingProject(project))}
          >
            Locate
          </button>
          <button
            type="button"
            className="modal-btn"
            disabled={busy}
            onClick={() => void run(() => removeProject(project.id))}
          >
            Remove
          </button>
        </div>
      )}
      {error && <p className="context-error">{error}</p>}
    </div>
  );
}
