import { useProjectStore } from "../../stores/projectStore";
import { ensureGitHubRepository } from "../../lib/github/ensureRepository";
import { projectMetaApi } from "../../lib/tauri/accountApi";

export function ProjectSettingsPage() {
  const project = useProjectStore((state) => state.currentProject);
  const settings = useProjectStore((state) => state.projectSettings);
  const update = useProjectStore((state) => state.updateProjectSetting);
  const gitStatus = useProjectStore((state) => state.gitStatus);
  const gitError = useProjectStore((state) => state.gitError);

  if (!project) {
    return <main className="page"><div className="page-subtitle">Open a project to edit project settings.</div></main>;
  }

  const githubLabel = project.githubOwner && project.githubRepo
    ? `${project.githubOwner}/${project.githubRepo}`
    : "Not connected";

  return (
    <main className="page">
      <header className="page-heading"><div><h1 className="page-title">Project Settings</h1><div className="page-subtitle">{project.name}</div></div></header>
      <section className="settings-panel">
        <h2>General</h2>
        <div className="setting-row"><div className="setting-copy"><div className="setting-label">Name</div></div><div>{project.name}</div></div>
        <div className="setting-row"><div className="setting-copy"><div className="setting-label">Local path</div></div><div>{project.localPath}</div></div>
        <h2>Git</h2>
        <div className="setting-row"><div className="setting-copy"><div className="setting-label">GitHub Repository</div><div className="setting-description">{githubLabel}</div></div>
          {project.githubOwner ? (
            <div className="modal-actions">
              <a className="modal-btn" href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noreferrer">Open on GitHub</a>
              <button type="button" className="modal-btn" onClick={() => {
                void projectMetaApi.githubDelete(project.id).then(() => {
                  useProjectStore.getState().patchCurrentProject({ githubOwner: null, githubRepo: null });
                });
              }}>Disconnect</button>
            </div>
          ) : (
            <button
              type="button"
              className="modal-btn"
              onClick={() => void ensureGitHubRepository(project, { promptSignIn: true })}
            >
              Create or connect repository
            </button>
          )}
        </div>
        {gitError && <div className="setting-error">{gitError}</div>}
        <div className="setting-row"><div className="setting-copy"><div className="setting-label">Branch</div></div><div>{gitStatus?.branch ?? project.defaultBranch ?? "—"}</div></div>
        <h2>AI</h2>
        <div className="setting-row">
          <div className="setting-copy"><div className="setting-label">Project model override</div></div>
          <input className="composer-input" value={String(settings.defaultModel ?? "")} placeholder="Use global default" onChange={(event) => update("defaultModel", event.target.value)} />
        </div>
        <h2>Agent</h2>
        <div className="setting-row">
          <div className="setting-copy"><div className="setting-label">Project rules</div><div className="setting-description">Loaded from .kursor/rules when this project is active.</div></div>
        </div>
        <h2>RAG</h2>
        <div className="setting-row">
          <div className="setting-copy"><div className="setting-label">Index isolation</div><div className="setting-description">Vectors are stored per project id.</div></div>
        </div>
      </section>
    </main>
  );
}
