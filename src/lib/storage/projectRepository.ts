import { databaseApi } from "../tauri/databaseApi";
import type { ProjectRecord } from "./types";

export const projectRepository = {
  upsert: (project: ProjectRecord) => databaseApi.projectsUpsert(project),
  listRecent: (limit = 12) => databaseApi.projectsListRecent(limit),
  list: (accountId?: string | null) => databaseApi.projectsList(accountId),
  get: (id: string) => databaseApi.projectsGet(id),
  getByPath: (path: string) => databaseApi.projectsGetByPath(path),
  delete: (id: string) => databaseApi.projectsDelete(id),
};
