export type PlanStatus = "draft" | "approved" | "building" | "done";

export type PlanTodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface PlanTodo {
  id: string;
  content: string;
  status: PlanTodoStatus;
}

export interface PlanDocument {
  id: string;
  slug: string;
  path: string;
  name: string;
  overview: string;
  body: string;
  todos: PlanTodo[];
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
}

export function planProgress(plan: PlanDocument | null | undefined): { done: number; total: number } {
  if (!plan) return { done: 0, total: 0 };
  const total = plan.todos.length;
  const done = plan.todos.filter((todo) => todo.status === "completed").length;
  return { done, total };
}

export function isPlanTodoStatus(value: unknown): value is PlanTodoStatus {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "cancelled";
}

export function isPlanStatus(value: unknown): value is PlanStatus {
  return value === "draft" || value === "approved" || value === "building" || value === "done";
}
