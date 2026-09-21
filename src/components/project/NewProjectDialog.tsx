import { useEffect, useState } from "react";
import { openProjectAt } from "../../lib/project/workspaceActions";
import { projectService } from "../../lib/project/ProjectService";
import { gitService } from "../../lib/git/GitService";
import { ensureGitHubRepository } from "../../lib/github/ensureRepository";
import { useAccountStore } from "../../stores/accountStore";
import { useProjectStore } from "../../stores/projectStore";

function joinProjectPath(parent: string, name: string) {
  const trimmed = parent.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${name.trim()}`;
}

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  if (!open) return null;

  const create = async () => {
    if (!name.trim() || !parent) return;
    setBusy(true);
    setError("");
    const path = joinProjectPath(parent, name);
    try {
      await projectService.createFolder(path);
      const opened = await openProjectAt(path, { ensureGitHub: false });
      if (!opened) return;
      await gitService.init();
      const isRepo = await gitService.isRepo().catch(() => false);
      if (!isRepo) {
        setError("Unable to initialize the git repository.");
        return;
      }
      const project = useProjectStore.getState().currentProject;
      if (project) await ensureGitHubRepository(project, { requireRemote: true, promptSignIn: true });
      const gitError = useProjectStore.getState().gitError;
      const current = useProjectStore.getState().currentProject;
      if (gitError || !current?.githubOwner || !current?.githubRepo) {
        setError(gitError || "Unable to create the GitHub repository.");
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ width: 420 }}>
        <h3>New Project</h3>
        <label className="setting-label">Project name</label>
        <input className="composer-input" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="setting-label">Local directory</label>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={() => void projectService.pickDirectory().then((value) => value && setParent(value))}>
            {parent || "Choose folder"}
          </button>
        </div>
        <p className="setting-description">
          Creates a local git repository in the chosen folder and a private GitHub repository
          {githubConnected ? "." : ". GitHub sign-in will open if you are not connected."}
        </p>
        {busy && statusMessage && <p className="setting-description">{statusMessage}</p>}
        {error && <p className="context-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn primary" disabled={busy || !name.trim() || !parent} onClick={() => void create()}>
            {busy ? (statusMessage || "Creating…") : "Create"}
          </button>
          <button type="button" className="modal-btn" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
