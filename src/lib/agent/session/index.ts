import { CompactionManager } from "./CompactionManager";
import { createDefaultMemoryManager } from "./MemoryManager";
import { SessionManager } from "./SessionManager";
import { createSessionStores } from "./stores";

export { CompactionManager } from "./CompactionManager";
export { createDefaultMemoryManager, MemoryManager } from "./MemoryManager";
export { SessionManager } from "./SessionManager";
export {
  MemoryRunStore,
  MemorySessionStore,
  MemoryToolCallStore,
  createSessionStores,
} from "./stores";
export {
  COMPACT_KEEP_MESSAGES,
  INTERRUPTED_TOOL_ERROR,
  SESSION_COMPACT_PREFIX,
  emptySnapshot,
  isInterruptedTool,
  parseCheckpoint,
  serializeCheckpoint,
} from "./types";
export type {
  AgentSession,
  CompactInput,
  CompactResult,
  ProcessJobRef,
  SessionSnapshot,
  SessionStatus,
} from "./types";

export function createSessionManager() {
  const stores = createSessionStores();
  return new SessionManager(stores.sessions, stores.runs, stores.tools);
}

export const sessionManager = createSessionManager();
export const compactionManager = new CompactionManager();
export const memoryManager = createDefaultMemoryManager();
