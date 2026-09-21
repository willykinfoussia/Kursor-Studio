import { useEffect, type MouseEvent } from "react";
import type { GitCommitInfo } from "../../types/tauri";
import { useDialogStore } from "../../stores/dialogStore";
import { useGitStore } from "../../stores/gitStore";

export interface CommitMenuState {
  x: number;
  y: number;
  commit: GitCommitInfo;
}

export function CommitContextMenu({
  menu,
  onClose,
}: {
  menu: CommitMenuState;
  onClose: () => void;
}) {
  const busy = useGitStore((state) => state.busy);
  const checkoutCommit = useGitStore((state) => state.checkoutCommit);
  const cherryPick = useGitStore((state) => state.cherryPick);
  const revertCommit = useGitStore((state) => state.revertCommit);
  const resetTo = useGitStore((state) => state.resetTo);
  const dropCommit = useGitStore((state) => state.dropCommit);
  const createBranchFromCommit = useGitStore((state) => state.createBranchFromCommit);
  const { commit } = menu;
  const canDrop = commit.parents.length === 1;

  useEffect(() => {
    const close = () => onClose();
    const timer = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("blur", close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const run = (action: () => void | Promise<void>) => {
    onClose();
    void action();
  };

  const createBranch = async () => {
    const name = await useDialogStore.getState().askPrompt("Branch name", `branch-${commit.shortSha}`);
    if (!name?.trim()) return;
    await createBranchFromCommit(name.trim(), commit.sha);
  };

  const reset = async (mode: "mixed" | "hard") => {
    const ok = await useDialogStore.getState().askConfirm(
      mode === "hard" ? "Hard reset to this commit?" : "Reset to this commit?",
      mode === "hard"
        ? "Later commits and uncommitted changes on this branch will be discarded."
        : "Later commits will be removed from this branch. Uncommitted files are kept.",
      "Reset",
      true,
    );
    if (!ok) return;
    await resetTo(commit.sha, mode);
  };

  const drop = async () => {
    const ok = await useDialogStore.getState().askConfirm(
      "Delete this commit?",
      "This rewrites the current branch and removes the commit. Do not do this if it was already pushed.",
      "Delete",
      true,
    );
    if (!ok) return;
    await dropCommit(commit.sha);
  };

  return (
    <div
      className="context-menu git-commit-context"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => checkoutCommit(commit.sha))}>
        Checkout
      </button>
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => reset("mixed"))}>
        Rollback
      </button>
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => reset("hard"))}>
        Rollback hard
      </button>
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => revertCommit(commit.sha))}>
        Revert
      </button>
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => cherryPick(commit.sha))}>
        Cherry-pick
      </button>
      <button type="button" className="context-item" disabled={busy} onClick={() => run(() => createBranch())}>
        Create branch
      </button>
      <button type="button" className="context-item danger" disabled={busy || !canDrop} onClick={() => run(() => drop())}>
        Delete commit
      </button>
      <button
        type="button"
        className="context-item"
        onClick={() => run(() => navigator.clipboard?.writeText(commit.sha))}
      >
        Copy SHA
      </button>
    </div>
  );
}

export function openCommitMenu(
  event: MouseEvent,
  commit: GitCommitInfo,
  setMenu: (menu: CommitMenuState) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const pad = 8;
  const width = 180;
  const height = 280;
  const x = Math.min(event.clientX, window.innerWidth - width - pad);
  const y = Math.min(event.clientY, window.innerHeight - height - pad);
  setMenu({ x: Math.max(pad, x), y: Math.max(pad, y), commit });
}
