import { databaseApi } from "../tauri/databaseApi";
import type { AgentRunRecord } from "./types";

export const agentRunRepository = {
  upsert: (run: AgentRunRecord) => databaseApi.agentRunsUpsert(run),
  get: (id: string) => databaseApi.agentRunsGet(id),
  list: (projectId?: string | null, limit = 40) => databaseApi.agentRunsList(projectId, limit),
};
