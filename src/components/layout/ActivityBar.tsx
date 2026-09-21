import { BookOpen, Bot, FlaskConical, Folder, GitBranch, ListTodo, Puzzle, Settings, Workflow } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import type { AppView } from "../../types/ui";

const primary = [
  { id: "project" as AppView, label: "Project", icon: Folder },
  { id: "graph" as AppView, label: "Specs", icon: BookOpen },
  { id: "agents" as AppView, label: "Agents", icon: Bot },
  { id: "run" as AppView, label: "Run", icon: Workflow },
  { id: "tests" as AppView, label: "Tests", icon: FlaskConical },
  { id: "capabilities" as AppView, label: "Capabilities", icon: Puzzle },
  { id: "tasks" as AppView, label: "Tasks", icon: ListTodo },
  { id: "github" as AppView, label: "Git", icon: GitBranch },
];

export function ActivityBar() {
  const active = useUiStore((state) => state.activeView);
  const setView = useUiStore((state) => state.setView);
  const openSettings = useUiStore((state) => state.openSettings);

  const item = (id: AppView, label: string, Icon: typeof Folder) => (
    <button type="button" className={`activity-item ${active === id ? "active" : ""}`} onClick={() => setView(id)} title={label} aria-label={label} key={id}>
      <Icon size={19} strokeWidth={1.6} />
    </button>
  );

  return (
    <nav className="activity-bar" aria-label="Main navigation">
      {primary.map(({ id, label, icon }) => item(id, label, icon))}
      <div className="activity-spacer" />
      <button
        type="button"
        className={`activity-item ${active === "settings" ? "active" : ""}`}
        onClick={() => openSettings("Account")}
        title="Settings"
        aria-label="Settings"
      >
        <Settings size={19} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
