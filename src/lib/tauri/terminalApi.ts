import type { TerminalExitPayload, TerminalOutputPayload, TerminalSessionInfo } from "../../types/tauri";
import { listenEvent, TAURI_EVENTS } from "./events";
import { invokeCommand } from "./invoke";

export const terminalApi = {
  create: (cwd: string, shell?: string) =>
    invokeCommand<TerminalSessionInfo>("terminal_create", { cwd, shell }),
  write: (sessionId: string, data: string) =>
    invokeCommand<void>("terminal_write", { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invokeCommand<void>("terminal_resize", { sessionId, cols, rows }),
  kill: (sessionId: string) => invokeCommand<void>("terminal_kill", { sessionId }),
  onOutput: (handler: (payload: TerminalOutputPayload) => void) =>
    listenEvent<TerminalOutputPayload>(TAURI_EVENTS.terminalOutput, handler),
  onExit: (handler: (payload: TerminalExitPayload) => void) =>
    listenEvent<TerminalExitPayload>(TAURI_EVENTS.terminalExit, handler),
};
