import { toUserError } from "../errors";
import { terminalApi } from "../tauri/terminalApi";
import type { TerminalService } from "./TerminalService";

export class TauriTerminalService implements TerminalService {
  async createSession(cwd: string, shell?: string) {
    try {
      const session = await terminalApi.create(cwd, shell);
      return {
        id: session.id,
        shell: session.shell,
        cwd: session.cwd,
        status: session.status,
      };
    } catch (error) {
      throw new Error(toUserError(error, "Unable to start terminal."));
    }
  }

  async write(sessionId: string, input: string) {
    try {
      await terminalApi.write(sessionId, input);
    } catch (error) {
      throw new Error(toUserError(error, "Unable to write to the terminal."));
    }
  }

  async resize(sessionId: string, cols: number, rows: number) {
    try {
      await terminalApi.resize(sessionId, cols, rows);
    } catch {
      // Resize can fail if the session already exited.
    }
  }

  async kill(sessionId: string) {
    try {
      await terminalApi.kill(sessionId);
    } catch (error) {
      throw new Error(toUserError(error, "Unable to stop the terminal."));
    }
  }

  onOutput(listener: (sessionId: string, data: string) => void) {
    let disposed = false;
    let dispose: () => void = () => {};
    void terminalApi.onOutput((payload) => listener(payload.sessionId, payload.data)).then((unlisten) => {
      if (disposed) unlisten();
      else dispose = unlisten;
    });
    return () => {
      disposed = true;
      dispose();
    };
  }

  onExit(listener: (sessionId: string, exitCode: number | null) => void) {
    let disposed = false;
    let dispose: () => void = () => {};
    void terminalApi.onExit((payload) => listener(payload.sessionId, payload.exitCode)).then((unlisten) => {
      if (disposed) unlisten();
      else dispose = unlisten;
    });
    return () => {
      disposed = true;
      dispose();
    };
  }
}

export const tauriTerminalService = new TauriTerminalService();
