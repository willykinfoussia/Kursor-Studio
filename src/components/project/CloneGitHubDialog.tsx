import { useEffect, useMemo, useState } from "react";
import { githubService } from "../../lib/github/GitHubService";
import { gitService } from "../../lib/git/GitService";
import { projectService } from "../../lib/project/ProjectService";
import { openProjectAt } from "../../lib/project/workspaceActions";
import type { GitHubRepository } from "../../lib/tauri/githubApi";

export function CloneGitHubDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<GitHubRepository | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));
  }, [query, repos]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRepos(await githubService.listRepositories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  const clone = async () => {
    if (!selected) return;
    const parent = await projectService.pickDirectory();
    if (!parent) return;
    const dest = `${parent.replace(/[\\/]+$/, "")}/${selected.name}`;
    setLoading(true);
    try {
      await gitService.clone(selected.cloneUrl, dest);
      await openProjectAt(dest);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ width: 460 }}>
        <h3>Clone from GitHub</h3>
        <input className="composer-input" placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
        {error && <p>{error}</p>}
        <div className="home-recents" style={{ maxHeight: 280, overflow: "auto", margin: "12px 0" }}>
          {loading && <div className="block-empty">Loading repositories…</div>}
          {filtered.map((repo) => (
            <button key={repo.id} type="button" className={`home-recent ${selected?.id === repo.id ? "selected" : ""}`} onClick={() => setSelected(repo)}>
              <strong>{repo.fullName}</strong>
              <span>{repo.private ? "private" : "public"}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn primary" disabled={!selected || loading} onClick={() => void clone()}>Clone</button>
          <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
