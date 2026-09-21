import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { relativeTime } from "../../lib/git/format";
import { useGitStore } from "../../stores/gitStore";
import { CommitContextMenu, openCommitMenu, type CommitMenuState } from "./CommitContextMenu";
import { DiffViewer } from "./DiffViewer";

export function CommitDetails() {
  const detail = useGitStore((state) => state.commitDetail);
  const contents = useGitStore((state) => state.commitContents);
  const activePath = useGitStore((state) => state.commitActivePath);
  const selectCommitFile = useGitStore((state) => state.selectCommitFile);
  const [menu, setMenu] = useState<CommitMenuState | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  if (!detail) {
    return <div className="git-empty-state"><h2>No commit selected</h2><p>Choose a commit from history or the graph to inspect its diff.</p></div>;
  }

  const commit = detail.commit;

  return (
    <div className="git-commit-details">
      <div className="git-commit-heading">
        <div>
          <h3>{commit.subject}</h3>
          <div className="git-commit-meta">{commit.author} · {relativeTime(commit.timestamp)} · {commit.shortSha}</div>
        </div>
        <div className="git-commit-more">
          <button
            ref={ref}
            type="button"
            className="icon-btn"
            aria-label="Commit actions"
            onClick={(event) => openCommitMenu(event, commit, setMenu)}
            onContextMenu={(event) => openCommitMenu(event, commit, setMenu)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
      {commit.body && <pre className="git-commit-desc">{commit.body}</pre>}
      <div className="git-commit-stats">{detail.files.length} files · +{commit.insertions} -{commit.deletions}</div>
      <div className="git-commit-files">
        {detail.files.map((file) => (
          <button
            type="button"
            key={file.path}
            className={`git-file-row${activePath === file.path ? " active" : ""}`}
            onClick={() => void selectCommitFile(file.path)}
          >
            <span className={`git-kind git-kind-${file.kind}`}>{file.kind}</span>
            <span className="git-file-name">{file.path}</span>
            <span className="git-file-stat">+{file.additions} -{file.deletions}</span>
          </button>
        ))}
      </div>
      <div className="git-commit-diff">
        <DiffViewer
          path={activePath}
          original={contents?.original ?? ""}
          modified={contents?.modified ?? ""}
          binary={contents?.binary}
          tooLarge={contents?.tooLarge}
          hunkActions={false}
        />
      </div>
      {menu && <CommitContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
