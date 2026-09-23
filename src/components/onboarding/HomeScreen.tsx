import { useAccountStore } from "../../stores/accountStore";
import { useProjectStore } from "../../stores/projectStore";
import { isMissingProject } from "../../lib/project/ProjectService";
import { pickAndOpenProject } from "../../lib/project/workspaceActions";
import { UnassignedConversations } from "../project/UnassignedConversations";
import { ProjectListItem } from "../project/ProjectListItem";

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
  const projectError = useProjectStore((state) => state.error);
  const removeMissingProjects = useProjectStore((state) => state.removeMissingProjects);
  const name = account?.displayName || account?.username || "there";
  const missingCount = recentProjects.filter(isMissingProject).length;

  return (
    <div className="welcome-screen">
      <div className="welcome-card home-card">
        <h1>Welcome back, {name}</h1>
        <div className={`home-github ${githubConnected ? "on" : ""}`}>
          {githubConnected ? `GitHub connected${githubUsername ? ` as @${githubUsername}` : ""}` : "Local account"}
        </div>
        {error && <div className="welcome-error">{error}</div>}
        {projectError && <div className="welcome-error">{projectError}</div>}
        {statusMessage && !error && <div className="welcome-status">{statusMessage}</div>}
        {!githubConnected && (
          <button type="button" className="welcome-btn primary" disabled={isLoading} onClick={() => void signInGitHub().catch(() => undefined)}>
            {isLoading ? (statusMessage ?? "Opening GitHub…") : "Connect GitHub"}
          </button>
        )}
        <div className="home-recents-heading">
          <h2 className="home-heading">Recent Projects</h2>
          {missingCount > 0 && (
            <button type="button" className="home-missing-clear" onClick={() => void removeMissingProjects()}>
              Remove missing
            </button>
          )}
        </div>
        <div className="home-recents">
          {recentProjects.length === 0 && <div className="block-empty">No projects yet.</div>}
          {recentProjects.map((project) => (
            <ProjectListItem key={project.id} project={project} />
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
