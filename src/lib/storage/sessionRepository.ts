import { databaseApi } from "../tauri/databaseApi";
import type { AgentSessionRecord } from "./types";

export const sessionRepository = {
  upsert: (session: AgentSessionRecord) => databaseApi.sessionsUpsert(session),
  get: (id: string) => databaseApi.sessionsGet(id),
  list: (projectId?: string | null, status?: string | null) =>
    databaseApi.sessionsList(projectId, status),
  listInterrupted: (projectId?: string | null) =>
    databaseApi.sessionsListInterrupted(projectId),
};
