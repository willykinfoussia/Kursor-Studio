import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { initials } from "../../lib/git/format";
import { useAccountStore } from "../../stores/accountStore";
import { useGitStore, type GitCommitAction } from "../../stores/gitStore";

const ACTIONS: { id: GitCommitAction; label: string }[] = [
  { id: "commit", label: "Commit" },
  { id: "commitPush", label: "Commit & Push" },
  { id: "commitPushPr", label: "Commit, Push & create PR" },
];

export function CommitPanel() {
  const summary = useGitStore((state) => state.summary);
  const description = useGitStore((state) => state.description);
  const busy = useGitStore((state) => state.busy);
  const author = useGitStore((state) => state.author);
  const remotes = useGitStore((state) => state.remotes);
  const commitAction = useGitStore((state) => state.commitAction);
  const account = useAccountStore((state) => state.currentAccount);
  const status = useGitStore((state) => state.status);
  const selectedPaths = useGitStore((state) => state.selectedPaths);
  const setSummary = useGitStore((state) => state.setSummary);
  const setDescription = useGitStore((state) => state.setDescription);
  const setCommitAction = useGitStore((state) => state.setCommitAction);
  const commit = useGitStore((state) => state.commit);
  const branch = status?.branch ?? "HEAD";
  const avatarUrl = account?.avatarUrl || author?.avatarUrl;
  const label = account?.displayName || account?.username || author?.name || author?.login || "You";
  const hasRemote = remotes.length > 0;
  const action = hasRemote ? commitAction : "commit";
  const actionLabel = action === "commitPushPr"
    ? `Commit, Push & PR to ${branch}`
    : action === "commitPush"
      ? `Commit & Push to ${branch}`
      : `Commit to ${branch}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  return (
    <div className="git-commit">
      <div className="git-commit-form">
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="git-avatar git-avatar-lg" />
          : <span className="git-avatar git-avatar-lg git-avatar-fallback">{initials(label)}</span>}
        <div className="git-commit-fields">
          <input
            className="composer-input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Summary (required)"
          />
          <textarea
            className="composer-input git-commit-body"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            rows={3}
          />
        </div>
      </div>
      <div className={`git-commit-actions${hasRemote ? "" : " single"}`} ref={menuRef}>
        <button
          type="button"
          className="git-commit-btn"
          disabled={busy || !summary.trim() || selectedPaths.length === 0}
          onClick={() => void commit()}
        >
          {actionLabel}
        </button>
        {hasRemote && (
          <button
            type="button"
            className="git-commit-menu-btn"
            disabled={busy}
            aria-label="Commit options"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronDown size={14} />
          </button>
        )}
        {menuOpen && hasRemote && (
          <div className="git-commit-menu-list" role="menu">
            {ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === commitAction ? "active" : ""}
                onClick={() => {
                  setCommitAction(item.id);
                  setMenuOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
