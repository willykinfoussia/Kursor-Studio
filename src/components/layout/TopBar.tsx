import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Command, GitBranch, PanelRight, Settings, User } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAccountStore } from "../../stores/accountStore";
import { IconButton } from "../ui/Controls";
import { openProjectAt, pickAndOpenProject } from "../../lib/project/workspaceActions";
import { gitService } from "../../lib/git/GitService";
import { gitAuthErrorCopy, gitInstallUrl, isGitAuthError, isGitMissingError, withGitAuthRetry } from "../../lib/git/gitRecovery";
import { ensureGitHubRepository, hasLiveGitHubSession, refreshGitStatus } from "../../lib/github/ensureRepository";
import { openExternalUrl } from "../../lib/tauri/openUrl";
import { useGitStore } from "../../stores/gitStore";

export function TopBar({
  onClone,
  onNew,
}: {
  onClone: () => void;
  onNew: () => void;
}) {
  const setView = useUiStore((state) => state.setView);
  const openSettings = useUiStore((state) => state.openSettings);
  const agentVisible = useUiStore((state) => state.agentVisible);
  const toggleAgent = useUiStore((state) => state.toggleAgent);
  const currentProject = useProjectStore((state) => state.currentProject);
  const projects = useProjectStore((state) => state.projects);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const gitStatus = useProjectStore((state) => state.gitStatus);
  const gitError = useProjectStore((state) => state.gitError);
  const projectError = useProjectStore((state) => state.error);
  const isLoading = useProjectStore((state) => state.isLoading);
  const refreshProjects = useProjectStore((state) => state.refreshProjects);
  const account = useAccountStore((state) => state.currentAccount);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const signOutGitHub = useAccountStore((state) => state.signOutGitHub);
  const accountLoading = useAccountStore((state) => state.isLoading);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const accountError = useAccountStore((state) => state.error);
  const remotes = useGitStore((state) => state.remotes);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [liveGitHubSession, setLiveGitHubSession] = useState(githubConnected);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const gitRef = useRef<HTMLDivElement>(null);
  const listedProjects = projects.length > 0 ? projects : recentProjects;

  useEffect(() => {
    if (!menuOpen && !accountOpen && !gitOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (accountOpen && !accountRef.current?.contains(target)) setAccountOpen(false);
      if (gitOpen && !gitRef.current?.contains(target)) setGitOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen, accountOpen, gitOpen]);

  useEffect(() => {
    if (!gitOpen || !gitError || !isGitAuthError(gitError)) {
      setLiveGitHubSession(githubConnected);
      return;
    }
    let cancelled = false;
    void hasLiveGitHubSession().then((live) => {
      if (!cancelled) setLiveGitHubSession(live);
    });
    return () => {
      cancelled = true;
    };
  }, [gitOpen, gitError, githubConnected]);

  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const detachedHead = !gitStatus?.branch || gitStatus.branch === "HEAD";
  const hasRemoteUrl = remotes.some((remote) => remote.url.trim().length > 0);
  const canPushPull = !gitBusy && !detachedHead && (remotes.length === 0 || hasRemoteUrl);
  const gitLabel = gitStatus
    ? `${gitStatus.branch}${ahead ? ` ↑${ahead}` : ""}${behind ? ` ↓${behind}` : ""} ${gitStatus.clean ? "clean" : `${gitStatus.changedFiles} changes`}`
    : currentProject?.defaultBranch ?? "git";

  const runGit = async (action: () => Promise<void>) => {
    if (!currentProject) return;
    setGitBusy(true);
    try {
      await withGitAuthRetry(action);
      await refreshGitStatus();
      useProjectStore.getState().setGitError(null);
    } catch (error) {
      useProjectStore.getState().setGitError(error instanceof Error ? error.message : "Git command failed.");
    } finally {
      setGitBusy(false);
      setGitOpen(false);
    }
  };

  const toggleProjectMenu = () => {
    setMenuOpen((open) => {
      if (!open) void refreshProjects();
      return !open;
    });
  };

  const selectProject = async (path: string) => {
    try {
      const opened = await openProjectAt(path);
      if (opened) setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open the project.";
      useProjectStore.getState().setUnavailable(null);
      if (!useProjectStore.getState().error) {
        useProjectStore.setState({ error: message });
      }
    }
  };

  const openFromDisk = async () => {
    try {
      const opened = await pickAndOpenProject();
      if (opened) setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open the project.";
      if (!useProjectStore.getState().error) {
        useProjectStore.setState({ error: message });
      }
    }
  };

  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Command size={14} strokeWidth={2} /></span><span>Kursor</span></div>
      <div className="project-switcher-wrap" ref={menuRef}>
        <button type="button" className="project-switcher" onClick={toggleProjectMenu}>
          <span>{isLoading ? "Loading project..." : (currentProject?.name ?? "Open Project")}</span>
          <ChevronDown size={12} />
        </button>
        {menuOpen && (
          <div className="context-menu project-menu">
            {projectError && <div className="context-error">{projectError}</div>}
            {listedProjects.length > 0 && <div className="context-section">PROJECTS</div>}
            {listedProjects.map((project) => (
              <button
                type="button"
                className={`context-item${currentProject?.id === project.id ? " active" : ""}`}
                key={project.id}
                title={project.rootPath}
                onClick={() => void selectProject(project.rootPath)}
              >
                <span className="context-history-title">
                  {project.name}{currentProject?.id === project.id ? " · open" : ""}
                </span>
              </button>
            ))}
            <div className="context-divider" />
            <button type="button" className="context-item" onClick={() => void openFromDisk()}>Open Project</button>
            <button type="button" className="context-item" onClick={() => { setMenuOpen(false); onClone(); }}>Clone from GitHub</button>
            <button type="button" className="context-item" onClick={() => { setMenuOpen(false); onNew(); }}>New Project</button>
            <button type="button" className="context-item" onClick={() => { setMenuOpen(false); setView("project-settings"); }}>Project Settings</button>
          </div>
        )}
      </div>
      <div className="top-actions">
        <span className="status-pill"><span className="status-dot" /> {githubConnected ? "Connected" : currentProject ? "Running" : "Idle"}</span>
        <div className="git-menu-wrap" ref={gitRef}>
          <button type="button" className="git-status" disabled={!currentProject || gitBusy} onClick={() => setGitOpen((open) => !open)}>
            <GitBranch size={13} /> {gitBusy ? "Working…" : gitLabel}
          </button>
          {gitOpen && currentProject && (
            <div className="context-menu git-menu">
              {gitError && (
                <div className="context-error git-menu-error">
                  <span>{isGitMissingError(gitError)
                    ? "Git was not found on this machine. Install Git, then retry."
                    : isGitAuthError(gitError)
                      ? gitAuthErrorCopy(liveGitHubSession, accountLoading, statusMessage)
                      : gitError}</span>
                  {isGitMissingError(gitError) && (
                    <button
                      type="button"
                      className="context-item"
                      onClick={() => { void openExternalUrl(gitInstallUrl()); }}
                    >
                      Install Git
                    </button>
                  )}
                  {isGitAuthError(gitError) && liveGitHubSession && (
                    <button
                      type="button"
                      className="context-item"
                      onClick={() => { void refreshGitStatus(); }}
                    >
                      Retry
                    </button>
                  )}
                  {isGitAuthError(gitError) && !accountLoading && !liveGitHubSession && (
                    <button
                      type="button"
                      className="context-item"
                      onClick={() => { void signInGitHub({ ensureRepository: false }).catch(() => undefined); }}
                    >
                      Connect GitHub
                    </button>
                  )}
                </div>
              )}
              <button type="button" className="context-item" onClick={() => { setGitOpen(false); setView("github"); }}>Open Git view</button>
              <button type="button" className="context-item" disabled={gitBusy} onClick={() => { setGitOpen(false); setView("github"); }}>Commit</button>
              <button type="button" className="context-item" disabled={!canPushPull} onClick={() => void runGit(() => gitService.push())}>Push{ahead ? ` (${ahead})` : ""}</button>
              <button type="button" className="context-item" disabled={!canPushPull} onClick={() => void runGit(() => gitService.pull())}>Pull{behind ? ` (${behind})` : ""}</button>
              <button type="button" className="context-item" disabled={gitBusy} onClick={() => void runGit(() => gitService.fetch())}>Fetch</button>
              {currentProject.githubOwner && currentProject.githubRepo && (
                <button
                  type="button"
                  className="context-item"
                  onClick={() => {
                    setGitOpen(false);
                    void openExternalUrl(`https://github.com/${currentProject.githubOwner}/${currentProject.githubRepo}`);
                  }}
                >
                  Open on GitHub
                </button>
              )}
              {!currentProject.githubOwner && githubConnected && (
                <button
                  type="button"
                  className="context-item"
                  disabled={gitBusy}
                  onClick={() => void runGit(() => ensureGitHubRepository(currentProject, { promptSignIn: true }))}
                >
                  Create GitHub repository
                </button>
              )}
            </div>
          )}
        </div>
        <IconButton icon={Bell} label="Notifications" />
        <IconButton
          icon={PanelRight}
          label={agentVisible ? "Collapse Agent" : "Expand Agent"}
          className={agentVisible ? "active" : undefined}
          aria-pressed={agentVisible}
          onClick={() => toggleAgent()}
        />
        <IconButton icon={Settings} label="Settings" onClick={() => openSettings("Account")} />
        <div className="account-menu-wrap" ref={accountRef}>
          <button type="button" className="account-chip" onClick={() => setAccountOpen((open) => !open)}>
            {account?.avatarUrl ? <img src={account.avatarUrl} alt="" className="account-avatar" /> : <User size={14} />}
            <span>{accountLoading ? "Waiting…" : (account?.displayName || account?.username || "Account")}</span>
          </button>
          {accountOpen && (
            <div className="context-menu account-menu">
              {accountError && <div className="context-error">{accountError}</div>}
              {statusMessage && <div className="context-status">{statusMessage}</div>}
              <button type="button" className="context-item" onClick={() => { setAccountOpen(false); openSettings("Account"); }}>Account</button>
              {githubConnected
                ? <button type="button" className="context-item" onClick={() => { setAccountOpen(false); void signOutGitHub(); }}>Sign out GitHub</button>
                : (
                  <button
                    type="button"
                    className="context-item"
                    disabled={accountLoading}
                    onClick={() => { void signInGitHub().catch(() => undefined); }}
                  >
                    {accountLoading ? (statusMessage ?? "Opening GitHub…") : "Connect GitHub"}
                  </button>
                )}
              <button type="button" className="context-item" onClick={() => { setAccountOpen(false); openSettings("Account"); }}>Settings</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
