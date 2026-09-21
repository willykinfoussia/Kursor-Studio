import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { gitService } from "../../lib/git/GitService";
import { gitAuthErrorCopy, gitInstallUrl, isGitAuthError, isGitMissingError } from "../../lib/git/gitRecovery";
import { hasLiveGitHubSession } from "../../lib/github/ensureRepository";
import { openExternalUrl } from "../../lib/tauri/openUrl";
import { useAccountStore } from "../../stores/accountStore";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { CommitDetails } from "./CommitDetails";
import { DiffViewer } from "./DiffViewer";
import { GitChangesPanel } from "./GitChangesPanel";
import { GitToolbar } from "./GitToolbar";
import { GraphPanel } from "./GraphPanel";
import { HistoryPanel } from "./HistoryPanel";

function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return <Separator className={`resize-handle ${orientation}`} />;
}

export function GitWorkspace() {
  const hydrate = useGitStore((state) => state.hydrate);
  const mode = useGitStore((state) => state.mode);
  const setMode = useGitStore((state) => state.setMode);
  const error = useGitStore((state) => state.error);
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const project = useProjectStore((state) => state.currentProject);
  const contents = useGitStore((state) => state.contents);
  const activePath = useGitStore((state) => state.activePath);
  const loadDiff = useGitStore((state) => state.loadDiff);
  const status = useGitStore((state) => state.status);
  const remotes = useGitStore((state) => state.remotes);
  const hasChanges = gitService.files(status).length > 0;

  useEffect(() => {
    void hydrate();
  }, [hydrate, projectId]);

  if (!project) {
    return (
      <main className="page">
        <header className="page-heading">
          <div>
            <h1 className="page-title">Git</h1>
            <div className="page-subtitle">Open a project to use the Git workspace.</div>
          </div>
        </header>
      </main>
    );
  }

  const githubUrl = project.githubOwner && project.githubRepo
    ? `https://github.com/${project.githubOwner}/${project.githubRepo}`
    : null;

  return (
    <div className="git-workspace">
      <GitToolbar />
      {error && <GitErrorBanner error={error} />}
      <div className="git-panels">
        <Group className="git-panel-group" orientation="horizontal">
          <Panel id="git-sidebar" defaultSize="28%" minSize="18%" maxSize="40%">
            <div className="git-sidebar">
              <div className="git-sidebar-tabs">
                <button type="button" className={mode === "changes" ? "active" : ""} onClick={() => setMode("changes")}>
                  Changes
                </button>
                <button type="button" className={mode === "history" ? "active" : ""} onClick={() => setMode("history")}>
                  History
                </button>
              </div>
              {mode === "changes" ? (
                <GitChangesPanel />
              ) : (
                <Group className="git-history-split" orientation="vertical">
                  <Panel id="git-history-list" defaultSize="50%" minSize="20%">
                    <div className="git-history-pane">
                      <HistoryPanel />
                    </div>
                  </Panel>
                  <ResizeHandle orientation="vertical" />
                  <Panel id="git-history-graph" defaultSize="50%" minSize="20%">
                    <div className="git-history-pane">
                      <GraphPanel />
                    </div>
                  </Panel>
                </Group>
              )}
            </div>
          </Panel>
          <ResizeHandle orientation="horizontal" />
          <Panel id="git-diff" defaultSize="72%" minSize="40%">
            {mode === "history" ? (
              <CommitDetails />
            ) : !hasChanges ? (
              <GitEmptyState githubUrl={githubUrl} ahead={status?.ahead ?? 0} hasRemote={remotes.length > 0} />
            ) : (
              <DiffViewer
                path={activePath}
                original={contents?.original ?? ""}
                modified={contents?.modified ?? ""}
                binary={contents?.binary}
                tooLarge={contents?.tooLarge}
                hunkActions={false}
                onForceLoad={() => activePath && void loadDiff(activePath, { force: true })}
              />
            )}
          </Panel>
        </Group>
      </div>
    </div>
  );
}

function GitErrorBanner({ error }: { error: string }) {
  const hydrate = useGitStore((state) => state.hydrate);
  const accountLoading = useAccountStore((state) => state.isLoading);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const missing = isGitMissingError(error);
  const auth = isGitAuthError(error);
  const [liveSession, setLiveSession] = useState(githubConnected);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    void hasLiveGitHubSession().then((live) => {
      if (!cancelled) setLiveSession(live);
    });
    return () => {
      cancelled = true;
    };
  }, [auth, error, githubConnected]);

  const message = missing
    ? "Git was not found on this machine. Install Git, then retry."
    : auth
      ? gitAuthErrorCopy(liveSession, accountLoading, statusMessage)
      : error;
  const showConnect = auth && !accountLoading && !liveSession;

  return (
    <div className="setting-error git-error git-error-banner">
      <span>{message}</span>
      {missing && (
        <>
          <button type="button" className="git-error-action" onClick={() => void openExternalUrl(gitInstallUrl())}>
            Install Git
          </button>
          <button type="button" className="git-error-action" onClick={() => void hydrate()}>
            Retry
          </button>
        </>
      )}
      {auth && liveSession && (
        <button type="button" className="git-error-action" onClick={() => void hydrate()}>
          Retry
        </button>
      )}
      {showConnect && (
        <button
          type="button"
          className="git-error-action"
          onClick={() => void signInGitHub({ ensureRepository: false }).catch(() => undefined)}
        >
          Connect GitHub
        </button>
      )}
    </div>
  );
}

function GitEmptyState({
  githubUrl,
  ahead,
  hasRemote,
}: {
  githubUrl: string | null;
  ahead: number;
  hasRemote: boolean;
}) {
  const detail = ahead > 0
    ? "Local commits are not on the remote yet. Use Push origin in the toolbar."
    : hasRemote || githubUrl
      ? "There are no uncommitted changes. Add files, then use Commit & Push to publish them to GitHub."
      : "There are no uncommitted changes in this repository.";
  return (
    <div className="git-empty-state">
      <h2>No local changes</h2>
      <p>{detail}</p>
      {githubUrl && (
        <button type="button" className="git-empty-action" onClick={() => void openExternalUrl(githubUrl)}>
          View on GitHub
        </button>
      )}
    </div>
  );
}
