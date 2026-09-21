import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown, GitFork } from "lucide-react";
import { openProjectAt } from "../../lib/project/workspaceActions";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";

export function RepositorySelector({
  icon: Icon = GitFork,
  chevron = false,
}: {
  icon?: ComponentType<{ size?: number }>;
  chevron?: boolean;
}) {
  const project = useProjectStore((state) => state.currentProject);
  const projects = useProjectStore((state) => state.projects);
  const recents = useProjectStore((state) => state.recentProjects);
  const remotes = useGitStore((state) => state.remotes);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listed = projects.length > 0 ? projects : recents;
  const remote = remotes[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="git-select" ref={ref}>
      <button type="button" className="git-select-btn" onClick={() => setOpen((value) => !value)}>
        <Icon size={13} />
        <span className="git-select-copy">
          <strong>{project?.name ?? "Repository"}</strong>
        </span>
        {chevron && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="context-menu git-dropdown">
          {project && (
            <div className="git-dropdown-meta">
              <div>{project.rootPath}</div>
              {remote && <div>{remote.url}</div>}
            </div>
          )}
          <div className="context-section">REPOSITORIES</div>
          {listed.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`context-item${item.id === project?.id ? " active" : ""}`}
              onClick={() => {
                setOpen(false);
                void openProjectAt(item.rootPath);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
