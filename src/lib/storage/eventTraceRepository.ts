import { databaseApi } from "../tauri/databaseApi";
import type { EventTraceRecord } from "./types";

export const eventTraceRepository = {
  append: (record: EventTraceRecord) => databaseApi.eventTracesAppend(record),
  list: (runId: string) => databaseApi.eventTracesList(runId),
};
