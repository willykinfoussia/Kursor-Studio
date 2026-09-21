import { databaseApi } from "../tauri/databaseApi";
import type { TaskRecord } from "./types";

export const taskRepository = {
  upsert: (task: TaskRecord) => databaseApi.tasksUpsert(task),
  list: (projectId?: string | null) => databaseApi.tasksList(projectId),
};
