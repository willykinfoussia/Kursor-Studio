import { describe, expect, it } from "vitest";
import { collectProductExcerpts, MAX_EXCERPT_FILES } from "../excerpts";

describe("collectProductExcerpts", () => {
  it("keeps product sources and drops lockfiles, minified files, and binaries", async () => {
    const read = new Map<string, string>([
      ["frontend/src/App.tsx", "export function App() { return null }"],
      ["package-lock.json", "LOCK"],
      ["frontend/dist/app.min.js", "min"],
      ["assets/logo.png", "png"],
      ["src/broken.ts", ""],
    ]);
    const excerpts = await collectProductExcerpts(
      [...read.keys(), "src/missing.ts", ".kursor/plans/demo.plan.md"],
      async (path) => {
        if (path === "src/missing.ts") throw new Error("missing");
        if (path === "src/binary.ts") return "a\0b";
        return read.get(path) ?? "";
      },
    );
    expect(excerpts.map((item) => item.path)).toEqual(["frontend/src/App.tsx"]);
    expect(excerpts[0]?.content).toContain("export function App");
  });

  it("reads at most eight files", async () => {
    const paths = Array.from({ length: 10 }, (_, index) => `src/file-${index}.ts`);
    const excerpts = await collectProductExcerpts(paths, async (path) => `export const id = ${path}`);
    expect(excerpts).toHaveLength(MAX_EXCERPT_FILES);
    expect(excerpts[0]?.path).toBe("src/file-0.ts");
    expect(excerpts.at(-1)?.path).toBe("src/file-7.ts");
  });
});