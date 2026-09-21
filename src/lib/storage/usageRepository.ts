import { databaseApi } from "../tauri/databaseApi";
import type { UsageRecord } from "./types";

export const usageRepository = {
  insert: (usage: UsageRecord) => databaseApi.usageInsert(usage),
  list: (limit = 200) => databaseApi.usageList(limit),
};
