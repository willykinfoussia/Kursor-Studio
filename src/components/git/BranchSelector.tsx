import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ChevronDown, GitBranch } from "lucide-react";
import { useDialogStore } from "../../stores/dialogStore";
import { useGitStore } from "../../stores/gitStore";

export function BranchSelector({
  icon: Icon = GitBranch,
  chevron = false,
}: {
  icon?: ComponentType<{ size?: number }>;
  chevron?: boolean;
}) {
  const branches = useGitStore((state) => state.branches);
  const status = useGitStore((state) => state.status);
  const checkout = useGitStore((state) => state.checkout);
  const createBranch = useGitStore((state) => state.createBranch);
  const busy = useGitStore((state) => state.busy);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = status?.branch ?? branches.find((branch) => branch.current)?.name ?? "HEAD";

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = branches.filter((branch) => !needle || branch.name.toLowerCase().includes(needle));
    return {
      local: match.filter((branch) => branch.kind === "local"),
      remote: match.filter((branch) => branch.kind === "remote"),
      tags: match.filter((branch) => branch.kind === "tag"),
    };
  }, [branches, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const promptCreate = async () => {
    const name = await useDialogStore.getState().askPrompt("New branch name", current);
    if (!name?.trim()) return;
    setOpen(false);
    await createBranch(name.trim());
  };

  return (
    <div className="git-select" ref={ref}>
      <button type="button" className="git-select-btn" onClick={() => setOpen((value) => !value)}>
        <Icon size={13} />
        <span className="git-select-copy">
          <strong>{current}</strong>
        </span>
        {chevron && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="context-menu git-dropdown git-branch-menu">
          <input
            className="composer-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
          />
          <button type="button" className="context-item" disabled={busy} onClick={() => void promptCreate()}>
            New branch
          </button>
          <BranchGroup
            title="LOCAL"
            names={grouped.local.map((item) => item.name)}
            current={current}
            busy={busy}
            onCheckout={(name) => { setOpen(false); void checkout(name); }}
          />
          <BranchGroup
            title="REMOTE"
            names={grouped.remote.map((item) => item.name)}
            current={current}
            busy={busy}
            onCheckout={(name) => { setOpen(false); void checkout(name); }}
          />
          <BranchGroup
            title="TAGS"
            names={grouped.tags.map((item) => item.name)}
            current={current}
            busy={busy}
            onCheckout={(name) => { setOpen(false); void checkout(name); }}
          />
        </div>
      )}
    </div>
  );
}

function BranchGroup({
  title,
  names,
  current,
  busy,
  onCheckout,
}: {
  title: string;
  names: string[];
  current: string;
  busy: boolean;
  onCheckout: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <>
      <div className="context-section">{title}</div>
      {names.slice(0, 40).map((name) => (
        <button
          type="button"
          key={name}
          className={`context-item${name === current ? " active" : ""}`}
          disabled={busy}
          onClick={() => onCheckout(name)}
        >
          {name}{name === current ? " · HEAD" : ""}
        </button>
      ))}
    </>
  );
}
