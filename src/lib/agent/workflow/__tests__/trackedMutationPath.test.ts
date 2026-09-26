import { describe, expect, it } from "vitest";
import { trackedMutationPath } from "../planPath";

describe("trackedMutationPath", () => {
  it("ignores reads and keeps mutating file paths", () => {
    expect(trackedMutationPath("read_file", { path: "src/App.tsx" }, false)).toBe("");
    expect(trackedMutationPath("list_files", { path: "backend/src" }, false)).toBe("");
    expect(trackedMutationPath("write_file", { path: "src/App.tsx" }, true)).toBe("src/App.tsx");
    expect(trackedMutationPath("apply_patch", { path: "src/db.ts" }, true)).toBe("src/db.ts");
  });
});
