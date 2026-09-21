import { useEffect } from "react";
import { CheckCircle2, CircleDot } from "lucide-react";
import { ProgressBar } from "../components/ui/Controls";
import { hydrateTasks } from "../lib/storage/session";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import type { AgentTask } from "../types/agent";

function TaskRows({ tasks, completed }: { tasks: AgentTask[]; completed: boolean }) {
  const rows = tasks.filter((task) => (task.status === "completed") === completed);
  if (rows.length === 0) {
    return <div className="block-empty">{completed ? "No completed tasks." : "No tasks in progress."}</div>;
  }
  return rows.map((task) => (
    <div className="task-row" key={task.id}>
      <div className="task-name">
        {completed ? <CheckCircle2 size={15} style={{ color: "var(--green)" }} /> : <CircleDot size={15} style={{ color: "var(--accent)" }} />}
        <div>{task.title}</div>
      </div>
      <ProgressBar value={task.progress} />
      <span className="task-percent">{task.progress}%</span>
    </div>
  ));
}

export function TasksPage() {
  const persisted = useAgentStore((state) => state.persistedTasks);
  const runTask = useAgentStore((state) => state.runTask);
  const liveTasks = useAgentStore((state) => state.tasks);
  const projectId = useProjectStore((state) => state.currentProject?.id);

  useEffect(() => {
    void hydrateTasks();
  }, [projectId, runTask?.status]);

  const byId = new Map<string, AgentTask>();
  for (const task of persisted) byId.set(task.id, task);
  for (const task of liveTasks) byId.set(task.id, task);
  if (runTask) byId.set(runTask.id, runTask);
  const tasks = [...byId.values()];

  return (
    <main className="page">
      <header className="page-heading"><div><h1 className="page-title">Tasks</h1><div className="page-subtitle">{projectId ? "Live progress for the current project." : "Open a project to see its tasks."}</div></div></header>
      <section className="task-section"><h2 className="task-section-title">IN PROGRESS</h2><TaskRows tasks={tasks} completed={false} /></section>
      <section className="task-section"><h2 className="task-section-title">COMPLETED</h2><TaskRows tasks={tasks} completed /></section>
    </main>
  );
}
