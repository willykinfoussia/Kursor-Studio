import { databaseApi } from "../tauri/databaseApi";
import type { AgentStepRecord } from "./types";

export const stepRepository = {
  upsert: (step: AgentStepRecord) => databaseApi.stepsUpsert(step),
  list: (agentRunId: string) => databaseApi.stepsList(agentRunId),
};
