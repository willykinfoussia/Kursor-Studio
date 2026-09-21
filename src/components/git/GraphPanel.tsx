import { useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { Filter } from "lucide-react";
import { relativeTime } from "../../lib/git/format";
import type { GitCommitInfo } from "../../types/tauri";
import { useGitStore } from "../../stores/gitStore";
import { CommitContextMenu, openCommitMenu } from "./CommitContextMenu";
import { CommitGraph, GRAPH_COLORS, GRAPH_ROW } from "./CommitGraph";

export function GraphPanel() {
  const commits = useGitStore((state) => state.graphCommits);
  const lanes = useGitStore((state) => state.graphLanes);
  const selectedSha = useGitStore((state) => state.selectedSha);
  const selectCommit = useGitStore((state) => state.selectCommit);
  const loadGraph = useGitStore((state) => state.loadGraph);
  const hasMore = useGitStore((state) => state.graphHasMore);
  const currentBranch = useGitStore((state) => state.status?.branch ?? null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; commit: GitCommitInfo } | null>(null);
  const needle = query.trim().toLowerCase();
  const layout = lanes.length === commits.length ? lanes : [];
  const matches = useMemo(() => {
    if (!needle) return null;
    return new Set(
      commits
        .filter((commit) =>
          `${commit.subject} ${commit.author} ${commit.sha} ${commit.refs.join(" ")}`
            .toLowerCase()
            .includes(needle),
        )
        .map((commit) => commit.sha),
    );
  }, [commits, needle]);

  const openMenu = (event: MouseEvent, commit: GitCommitInfo) => {
    void selectCommit(commit.sha);
    openCommitMenu(event, commit, setMenu);
  };

  return (
    <div className="git-graph-panel">
      <div className="git-filter">
        <Filter size={12} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" />
      </div>
      {commits.length === 0 ? (
        <div className="git-diff-empty">No commits to graph.</div>
      ) : (
        <div className="git-graph-scroll">
          <CommitGraph
            commits={commits}
            lanes={lanes}
            onCommitContextMenu={(event, sha) => {
              const commit = commits.find((item) => item.sha === sha);
              if (commit) openMenu(event, commit);
            }}
          />
          <div className="git-graph-rows">
            {commits.map((commit, index) => {
              const lane = layout[index]?.lane ?? 0;
              const dimmed = matches ? !matches.has(commit.sha) : false;
              return (
                <button
                  type="button"
                  key={commit.sha}
                  className={`git-graph-row${selectedSha === commit.sha ? " active" : ""}${dimmed ? " dimmed" : ""}`}
                  style={{ height: GRAPH_ROW }}
                  onClick={() => void selectCommit(commit.sha)}
                  onContextMenu={(event) => openMenu(event, commit)}
                >
                  <span className="git-graph-row-copy">
                    <strong>{commit.subject || commit.shortSha}</strong>
                    <em>{commit.author} · {relativeTime(commit.timestamp)}</em>
                  </span>
                  {commit.refs.length > 0 && (
                    <span className="git-ref-badges">
                      {commit.refs.map((ref) => (
                        <span
                          key={ref}
                          className={`git-ref-badge${isCurrentRef(ref, currentBranch) ? " current" : ""}`}
                          style={{ "--git-ref-color": GRAPH_COLORS[lane % GRAPH_COLORS.length] } as CSSProperties}
                        >
                          {ref}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {hasMore && (
        <button type="button" className="settings-action" onClick={() => void loadGraph(false)}>
          Load more
        </button>
      )}
      {menu && <CommitContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function isCurrentRef(ref: string, currentBranch: string | null) {
  if (!currentBranch) return false;
  return ref === currentBranch || ref.endsWith(`/${currentBranch}`);
}
