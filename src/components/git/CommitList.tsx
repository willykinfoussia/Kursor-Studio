import { Filter } from "lucide-react";
import { useState } from "react";
import { initials, relativeTime } from "../../lib/git/format";
import type { GitCommitInfo } from "../../types/tauri";
import { useGitStore } from "../../stores/gitStore";
import { CommitContextMenu, openCommitMenu } from "./CommitContextMenu";
import { VirtualList } from "./VirtualList";

export function CommitList({ commits }: { commits: GitCommitInfo[] }) {
  const selectedSha = useGitStore((state) => state.selectedSha);
  const query = useGitStore((state) => state.historyQuery);
  const setHistoryQuery = useGitStore((state) => state.setHistoryQuery);
  const selectCommit = useGitStore((state) => state.selectCommit);
  const loadHistory = useGitStore((state) => state.loadHistory);
  const hasMore = useGitStore((state) => state.historyHasMore);
  const [menu, setMenu] = useState<{ x: number; y: number; commit: GitCommitInfo } | null>(null);
  const filtered = query.trim()
    ? commits.filter((commit) => `${commit.subject} ${commit.author} ${commit.sha}`.toLowerCase().includes(query.trim().toLowerCase()))
    : commits;

  return (
    <div className="git-commit-list">
      <div className="git-filter">
        <Filter size={12} />
        <input value={query} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Filter" />
      </div>
      <VirtualList
        className="git-file-list"
        items={filtered}
        itemHeight={56}
        renderItem={(commit) => (
          <button
            type="button"
            key={commit.sha}
            className={`git-commit-row${selectedSha === commit.sha ? " active" : ""}`}
            onClick={() => void selectCommit(commit.sha)}
            onContextMenu={(event) => {
              void selectCommit(commit.sha);
              openCommitMenu(event, commit, setMenu);
            }}
          >
            <span className="git-avatar git-avatar-fallback">{initials(commit.author)}</span>
            <span className="git-commit-copy">
              <strong>{commit.subject || commit.shortSha}</strong>
              <em>{commit.author} · {relativeTime(commit.timestamp)}{commit.refs[0] ? ` · ${commit.refs[0]}` : ""}</em>
            </span>
          </button>
        )}
      />
      {hasMore && (
        <button type="button" className="settings-action" onClick={() => void loadHistory(false)}>Load more</button>
      )}
      {menu && <CommitContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
