import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const write = vi.fn();
const kill = vi.fn();

vi.mock("../../tauri/terminalApi", () => ({
  terminalApi: {
    create: (...args: unknown[]) => create(...args),
    write: (...args: unknown[]) => write(...args),
    resize: vi.fn(),
    kill: (...args: unknown[]) => kill(...args),
    onOutput: vi.fn(async () => () => undefined),
    onExit: vi.fn(async () => () => undefined),
  },
}));

import { TauriTerminalService } from "../TauriTerminalService";

describe("TauriTerminalService", () => {
  beforeEach(() => {
    create.mockReset();
    write.mockReset();
    kill.mockReset();
  });

  it("creates a session in the project cwd, writes stdin, and kills the process", async () => {
    create.mockResolvedValue({
      id: "session-1",
      shell: "powershell.exe",
      cwd: "C:/Projects/TodoApp",
      status: "running",
    });
    write.mockResolvedValue(undefined);
    kill.mockResolvedValue(undefined);

    const service = new TauriTerminalService();
    const session = await service.createSession("C:/Projects/TodoApp", "PowerShell");
    expect(session.cwd).toBe("C:/Projects/TodoApp");
    expect(session.status).toBe("running");
    expect(create).toHaveBeenCalledWith("C:/Projects/TodoApp", "PowerShell");

    await service.write(session.id, "pnpm dev\r");
    expect(write).toHaveBeenCalledWith("session-1", "pnpm dev\r");

    await service.kill(session.id);
    expect(kill).toHaveBeenCalledWith("session-1");
  });
});
