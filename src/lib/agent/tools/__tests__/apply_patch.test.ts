import { describe, expect, it, vi } from "vitest";
import { applyUniquePatch, createApplyPatchTool } from "../applyPatch";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("apply_patch", () => {
  it("replaces a unique match", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createApplyPatchTool({
      fs: createMockFs({ readFile: vi.fn(async () => "hello world"), writeFile }),
    }).execute(
      { path: "README.md", old_string: "world", new_string: "kursor" },
      idleToolContext(),
    );
    expect(writeFile).toHaveBeenCalledWith("README.md", "hello kursor");
    expect(result.success).toBe(true);
  });

  it("fails when old_string matches 0 or 2 times", () => {
    expect(applyUniquePatch("abc", "z", "q", false).ok).toBe(false);
    expect(applyUniquePatch("aba", "a", "x", false).ok).toBe(false);
    expect(applyUniquePatch("aba", "a", "x", true).ok).toBe(true);
  });

  it("rejects path traversal", async () => {
    const result = await createApplyPatchTool({ fs: createMockFs() }).execute(
      { path: "../x.ts", old_string: "a", new_string: "b" },
      idleToolContext(),
    );
    expect(result.error?.code).toBe("path_outside_project");
  });
});
