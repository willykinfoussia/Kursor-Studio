import { useAgentStore } from "../../../stores/agentStore";
import { usePlanStore } from "../../../stores/planStore";
import { taskManager } from "../tasks/TaskManager";
import { isPlanTodoStatus } from "./types";

export function planProgressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function applyPlanTodoProgress(event: {
  planId: string;
  todoId: string;
  status: string;
  done: number;
  total: number;
}): void {
  if (isPlanTodoStatus(event.status)) {
    usePlanStore.getState().applyTodoStatus(event.planId, event.todoId, event.status);
  }
  const progress = planProgressPercent(event.done, event.total);
  const agent = useAgentStore.getState();
  if (agent.runTask) {
    agent.setRunTask({
      ...agent.runTask,
      progress: agent.runTask.status === "completed" ? 100 : progress,
    });
  }
  const active = taskManager.getActive();
  if (active && active.status === "running") {
    void taskManager.update(active.id, { progress });
  }
}
