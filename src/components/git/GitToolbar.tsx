import { relativeTime } from "../../lib/git/format";
import { useGitStore } from "../../stores/gitStore";
import { BranchSelector } from "./BranchSelector";
import { RepositorySelector } from "./RepositorySelector";

export function GitToolbar() {
  const status = useGitStore((state) => state.status);
  const busy = useGitStore((state) => state.busy);
  const remotes = useGitStore((state) => state.remotes);
  const lastFetchAt = useGitStore((state) => state.lastFetchAt);
  const fetch = useGitStore((state) => state.fetch);
  const pull = useGitStore((state) => state.pull);
  const push = useGitStore((state) => state.push);
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const action = behind > 0 ? "pull" : ahead > 0 ? "push" : "fetch";
  const label = action === "pull" ? "Pull origin" : action === "push" ? "Push origin" : "Fetch origin";
  const fetched = lastFetchAt ? `Last fetched ${relativeTime(lastFetchAt)}` : "Not fetched yet";
  const hasRemoteUrl = remotes.some((remote) => remote.url.trim().length > 0);
  const detachedHead = !status?.branch || status.branch === "HEAD";
  const syncDisabled = busy || !hasRemoteUrl || (action !== "fetch" && detachedHead);

  return (
    <div className="git-toolbar">
      <div className="git-toolbar-cell">
        <span className="git-toolbar-label">Current repository</span>
        <RepositorySelector chevron />
      </div>
      <div className="git-toolbar-cell">
        <span className="git-toolbar-label">Current branch</span>
        <BranchSelector chevron />
      </div>
      <div className="git-toolbar-cell">
        <span className="git-toolbar-label">&nbsp;</span>
        <button
          type="button"
          className="git-select-btn git-fetch-btn"
          disabled={syncDisabled}
          onClick={() => void (action === "pull" ? pull() : action === "push" ? push() : fetch())}
        >
          <span className="git-select-copy">
            <strong>{label}</strong>
            <em>{fetched}</em>
          </span>
        </button>
      </div>
    </div>
  );
}
