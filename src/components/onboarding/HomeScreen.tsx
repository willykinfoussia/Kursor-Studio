import { useAccountStore } from "../../stores/accountStore";
import { useProjectStore } from "../../stores/projectStore";
import { openProjectAt, pickAndOpenProject } from "../../lib/project/workspaceActions";
import { UnassignedConversations } from "../project/UnassignedConversations";

export function HomeScreen({
  onClone,
  onNew,
}: {
  onClone: () => void;
  onNew: () => void;
}) {
  const account = useAccountStore((state) => state.currentAccount);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const githubUsername = useAccountStore((state) => state.githubUsername);
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const isLoading = useAccountStore((state) => state.isLoading);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const error = useAccountStore((state) => state.error);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const unavailable = useProjectStore((state) => state.unavailable);
  const removeProject = useProjectStore((state) => state.removeProject);
  const setUnavailable = useProjectStore((state) => state.setUnavailable);
  const name = account?.displayName || account?.username || "there";

  return (
    <div className="welcome-screen">
      <div className="welcome-card home-card">
        <h1>Welcome back, {name}</h1>
        <div className={`home-github ${githubConnected ? "on" : ""}`}>
          {githubConnected ? `GitHub connected${githubUsername ? ` as @${githubUsername}` : ""}` : "Local account"}
        </div>
        {error && <div className="welcome-error">{error}</div>}
        {statusMessage && !error && <div className="welcome-status">{statusMessage}</div>}
        {!githubConnected && (
          <button type="button" className="welcome-btn primary" disabled={isLoading} onClick={() => void signInGitHub().catch(() => undefined)}>
            {isLoading ? (statusMessage ?? "Opening GitHub…") : "Connect GitHub"}
          </button>
        )}
        {unavailable && (
          <div className="welcome-error">
            <div>Project unavailable: {unavailable.name}</div>
            <div className="modal-actions" style={{ marginTop: 10 }}>
              <button type="button" className="welcome-btn" onClick={() => { void pickAndOpenProject().then(() => setUnavailable(null)); }}>Locate folder</button>
              <button type="button" className="welcome-btn" onClick={() => { void removeProject(unavailable.id).then(() => setUnavailable(null)); }}>Remove from Kursor</button>
            </div>
          </div>
        )}
        <h2 className="home-heading">Recent Projects</h2>
        <div className="home-recents">
          {recentProjects.length === 0 && <div className="block-empty">No projects yet.</div>}
          {recentProjects.map((project) => (
            <button key={project.id} type="button" className="home-recent" onClick={() => void openProjectAt(project.rootPath)}>
              <strong>{project.name}</strong>
              <span>{project.rootPath}</span>
            </button>
          ))}
        </div>
        <div className="home-actions">
          <button type="button" className="welcome-btn primary" onClick={() => void pickAndOpenProject()}>Open Project</button>
          <button type="button" className="welcome-btn" onClick={onClone} disabled={!githubConnected}>Clone from GitHub</button>
          <button type="button" className="welcome-btn" onClick={onNew}>New Project</button>
        </div>
        <UnassignedConversations projects={recentProjects} />
      </div>
    </div>
  );
}
