import { databaseApi } from "../tauri/databaseApi";
import type { MemoryRecord } from "./types";

export const memoryRepository = {
  save: (memory: MemoryRecord) => databaseApi.memoryUpsert(memory),
  get: (id: string) => databaseApi.memoryGet(id),
  search: (projectId: string | null | undefined, query: string) =>
    databaseApi.memorySearch(projectId, query),
  delete: (id: string) => databaseApi.memoryDelete(id),
};
