import { beforeEach, describe, expect, it, vi } from "vitest";

const createSession = vi.fn();
const kill = vi.fn();

vi.mock("../../lib/terminal/TauriTerminalService", () => ({
  tauriTerminalService: {
    createSession: (...args: unknown[]) => createSession(...args),
    kill: (...args: unknown[]) => kill(...args),
    write: vi.fn(),
    resize: vi.fn(),
    onOutput: vi.fn(),
    onExit: vi.fn(),
  },
}));

import { useProjectStore } from "../projectStore";
import { useTerminalStore } from "../terminalStore";

const project = {
  id: "proj-todo",
  accountId: "local-account",
  name: "TodoApp",
  rootPath: "C:/Projects/TodoApp",
  localPath: "C:/Projects/TodoApp",
};

describe("terminalStore", () => {
  beforeEach(() => {
    createSession.mockReset();
    kill.mockReset();
    useTerminalStore.setState({
      sessions: [],
      activeId: null,
      visible: true,
      creating: false,
      status: null,
    });
    useProjectStore.setState({ currentProject: project });
  });

  it("tracks process exit", () => {
    useTerminalStore.setState({
      sessions: [{
        id: "session-1",
        name: "powershell",
        shell: "powershell.exe",
        cwd: "C:/Projects/TodoApp",
        status: "running",
      }],
      activeId: "session-1",
    });
    useTerminalStore.getState().markExited("session-1", 0);
    expect(useTerminalStore.getState().sessions[0]?.status).toBe("exited");
    expect(useTerminalStore.getState().sessions[0]?.exitCode).toBe(0);
  });

  it("creates a session using the project root as cwd", async () => {
    createSession.mockResolvedValue({
      id: "session-1",
      shell: "powershell.exe",
      cwd: "C:/Projects/TodoApp",
      status: "running",
    });
    await useTerminalStore.getState().createSession();
    expect(createSession).toHaveBeenCalledWith("C:/Projects/TodoApp", expect.any(String));
    expect(useTerminalStore.getState().sessions[0]?.cwd).toBe("C:/Projects/TodoApp");
    expect(useTerminalStore.getState().activeId).toBe("session-1");
  });

  it("kills a running session and removes it on close", async () => {
    kill.mockResolvedValue(undefined);
    useTerminalStore.setState({
      sessions: [{
        id: "session-1",
        name: "powershell",
        shell: "powershell.exe",
        cwd: "C:/Projects/TodoApp",
        status: "running",
      }],
      activeId: "session-1",
    });
    await useTerminalStore.getState().closeSession("session-1");
    expect(kill).toHaveBeenCalledWith("session-1");
    expect(useTerminalStore.getState().sessions).toEqual([]);
    expect(useTerminalStore.getState().activeId).toBeNull();
  });

  it("closes previous project sessions and starts one for the new project", async () => {
    useTerminalStore.setState({
      sessions: [{
        id: "old",
        name: "powershell",
        shell: "powershell.exe",
        cwd: "C:/Projects/Other",
        status: "running",
      }],
      activeId: "old",
    });
    createSession.mockResolvedValue({
      id: "session-2",
      shell: "powershell.exe",
      cwd: "C:/Projects/TodoApp",
      status: "running",
    });
    await useTerminalStore.getState().resetForNewProject();
    expect(kill).toHaveBeenCalledWith("old");
    expect(useTerminalStore.getState().sessions.map((session) => session.id)).toEqual(["session-2"]);
  });
});
