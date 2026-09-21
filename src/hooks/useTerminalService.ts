import { useEffect } from "react";
import { tauriTerminalService } from "../lib/terminal/TauriTerminalService";
import { useTerminalStore } from "../stores/terminalStore";

export function useTerminalService() {
  const markExited = useTerminalStore((state) => state.markExited);

  useEffect(() => tauriTerminalService.onExit((sessionId, exitCode) => {
    markExited(sessionId, exitCode);
  }), [markExited]);

  return tauriTerminalService;
}
