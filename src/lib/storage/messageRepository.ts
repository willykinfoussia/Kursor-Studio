import { databaseApi } from "../tauri/databaseApi";
import type { MessageRecord } from "./types";

export const messageRepository = {
  upsert: (message: MessageRecord) => databaseApi.messagesUpsert(message),
  list: (conversationId: string, limit = 100, before?: number) =>
    databaseApi.messagesList(conversationId, limit, before),
};
