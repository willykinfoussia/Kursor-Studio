import { describe, expect, it } from "vitest";
import {
  inputCwd,
  inputFilePath,
  inputPath,
  isProtectedPath,
  pathAccessForTool,
} from "../protectedPaths";

describe("protectedPaths", () => {
  it("blocks secret reads and always-protected names", () => {
    expect(isProtectedPath(".env", "read")).toBe(true);
    expect(isProtectedPath("app/.env.local", "read")).toBe(true);
    expect(isProtectedPath("credentials.json", "write")).toBe(true);
    expect(isProtectedPath("id_rsa.pem", "write")).toBe(true);
    expect(isProtectedPath(".git/config", "write")).toBe(true);
  });

  it("allows env scaffolding writes and example reads", () => {
    expect(isProtectedPath(".env", "write")).toBe(false);
    expect(isProtectedPath("tinder-clone/.env.local", "write")).toBe(false);
    expect(isProtectedPath(".env.example", "read")).toBe(false);
    expect(isProtectedPath(".env.sample", "read")).toBe(false);
    expect(isProtectedPath(".env.template", "read")).toBe(false);
  });

  it("does not treat cwd as a file path for secrets", () => {
    expect(inputFilePath({ cwd: ".env.local", command: "pnpm test" })).toBeUndefined();
    expect(inputCwd({ cwd: "tinder-clone" })).toBe("tinder-clone");
    expect(inputPath({ cwd: "tinder-clone" })).toBe("tinder-clone");
    expect(inputFilePath({ path: ".env.local" })).toBe(".env.local");
  });

  it("classifies read tools as read access", () => {
    expect(pathAccessForTool("read_file", "filesystem.read")).toBe("read");
    expect(pathAccessForTool("write_file", "filesystem.write")).toBe("write");
    expect(pathAccessForTool("run_command", "terminal.execute")).toBe("write");
  });
});
