import { describe, expect, it, vi } from "vitest";
import { createSearchFilesTool } from "../searchFiles";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("search_files", () => {
  it("returns disk matches from the native walk", async () => {
    const searchProjectFiles = vi.fn(async () => [
      { name: "App.tsx", path: "src/App.tsx", relativePath: "src/App.tsx", kind: "file" as const },
    ]);
    const result = await createSearchFilesTool({ fs: createMockFs({ searchProjectFiles }) }).execute(
      { query: "App" },
      idleToolContext(),
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ query: "App", matches: [{ name: "App.tsx", path: "src/App.tsx" }] });
  });

  it("rejects an empty query", async () => {
    const result = await createSearchFilesTool({ fs: createMockFs() }).execute({ query: "  " }, idleToolContext());
    expect(result.error?.code).toBe("invalid_input");
  });
});
