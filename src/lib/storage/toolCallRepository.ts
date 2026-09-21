import { databaseApi } from "../tauri/databaseApi";
import type { ToolCallRecord } from "./types";

export const toolCallRepository = {
  upsert: (call: ToolCallRecord) => databaseApi.toolCallsUpsert(call),
  list: (agentRunId: string) => databaseApi.toolCallsList(agentRunId),
};
