import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./invoke";

export const TAURI_EVENTS = {
  agentMessage: "agent:message",
  agentStatus: "agent:status",
  agentToolStart: "agent:tool-start",
  agentToolComplete: "agent:tool-complete",
  terminalOutput: "terminal:output",
  terminalExit: "terminal:exit",
  projectFileChanged: "project:file-changed",
  userSpecsChanged: "user:specs-changed",
  taskUpdated: "task:updated",
  ragIndexProgress: "rag:index-progress",
  mcpEvent: "mcp-event",
} as const;

export async function listenEvent<T>(
  event: (typeof TAURI_EVENTS)[keyof typeof TAURI_EVENTS],
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<T>(event, ({ payload }) => handler(payload));
}
