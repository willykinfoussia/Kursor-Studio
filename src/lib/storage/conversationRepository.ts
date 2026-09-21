import { databaseApi } from "../tauri/databaseApi";
import type { ConversationRecord } from "./types";

export const conversationRepository = {
  create: (conversation: ConversationRecord) => databaseApi.conversationsUpsert(conversation),
  upsert: (conversation: ConversationRecord) => databaseApi.conversationsUpsert(conversation),
  list: (projectId?: string | null, includeArchived = false) =>
    databaseApi.conversationsList(projectId, includeArchived),
  get: (id: string) => databaseApi.conversationsGet(id),
  archive: (id: string) => databaseApi.conversationsArchive(id),
};
