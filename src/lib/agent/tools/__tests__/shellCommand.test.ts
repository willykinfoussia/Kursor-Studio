import { describe, expect, it } from "vitest";
import { assertKursorShellCommand } from "../shellCommand";

describe("assertKursorShellCommand", () => {
  it("allows a single cmd command", () => {
    expect(assertKursorShellCommand("pnpm test", "run")).toEqual({ ok: true });
    expect(assertKursorShellCommand("npx tsc --noEmit", "run")).toEqual({ ok: true });
    expect(assertKursorShellCommand("dir node_modules", "run")).toEqual({ ok: true });
  });

  it("rejects bash pipes, chaining, and unix tools", () => {
    expect(assertKursorShellCommand("dir node_modules 2>nul && echo EXISTS", "run").ok).toBe(false);
    expect(assertKursorShellCommand("rm -rf node_modules/.vite", "run").code).toBe("invalid_shell");
    expect(assertKursorShellCommand("curl -s http://example.com | head", "run").ok).toBe(false);
    expect(assertKursorShellCommand("ls", "run").code).toBe("invalid_shell");
    expect(assertKursorShellCommand("NODE_OPTIONS=--foo node x", "run").ok).toBe(false);
  });

  it("rejects long-running dev servers and localhost curl on run_command", () => {
    expect(assertKursorShellCommand("npm run dev", "run")).toMatchObject({ code: "use_start_process" });
    expect(assertKursorShellCommand("pnpm dev", "run").code).toBe("use_start_process");
    expect(assertKursorShellCommand("next dev", "run").code).toBe("use_start_process");
    expect(assertKursorShellCommand("curl -s http://localhost:5173/", "run").code).toBe("localhost_probe");
    expect(assertKursorShellCommand("npm run build", "run")).toEqual({ ok: true });
  });

  it("allows start_process for the dev server but still rejects pipes", () => {
    expect(assertKursorShellCommand("npm run dev", "start")).toEqual({ ok: true });
    expect(assertKursorShellCommand("pnpm dev | tee log", "start").ok).toBe(false);
  });
});
