import { describe, expect, it, vi } from "vitest";
import { createListFilesTool } from "../listFiles";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("list_files", () => {
  it("lists entries at a relative directory", async () => {
    const fs = createMockFs({
      listDirectory: vi.fn(async () => [
        { name: "App.tsx", path: "src/App.tsx", relativePath: "src/App.tsx", kind: "file" as const },
      ]),
    });
    const result = await createListFilesTool({ fs }).execute({ path: "src" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: "src", entries: [{ name: "App.tsx", path: "src/App.tsx", kind: "file" }] });
  });

  it("rejects a path outside the project", async () => {
    const result = await createListFilesTool({ fs: createMockFs() }).execute({ path: "../secret" }, idleToolContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("path_outside_project");
  });

  it("returns empty entries when the directory does not exist", async () => {
    const fs = createMockFs({
      listDirectory: vi.fn(async () => {
        throw new Error("Unable to read file.");
      }),
    });
    const result = await createListFilesTool({ fs }).execute({ path: "src" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: "src", entries: [] });
  });
});
