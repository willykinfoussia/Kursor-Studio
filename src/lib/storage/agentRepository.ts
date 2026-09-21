import { databaseApi } from "../tauri/databaseApi";
import type { AgentRecord } from "./types";

export const agentRepository = {
  list: () => databaseApi.agentsList(),
  upsert: (agent: AgentRecord) => databaseApi.agentsUpsert(agent),
};
