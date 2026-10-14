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

  it("reads at most eight files and at most three per directory", async () => {
    const paths = ["src", "lib", "app", "pages"].flatMap((dir) =>
      Array.from({ length: 4 }, (_, index) => `${dir}/file-${index}.ts`),
    );
    const excerpts = await collectProductExcerpts(paths, async (path) => `export const id = "${path}"`);
    expect(excerpts).toHaveLength(MAX_EXCERPT_FILES);
    for (const dir of ["src", "lib", "app", "pages"]) {
      expect(excerpts.filter((item) => item.path.startsWith(`${dir}/`)).length).toBeLessThanOrEqual(3);
    }
    expect(excerpts.some((item) => item.path === "lib/file-0.ts")).toBe(true);
  });

  it("keeps the end of a long file", async () => {
    const marker = "END_OF_FILE_MARKER";
    const excerpts = await collectProductExcerpts(
      ["src/long.ts"],
      async () => `${"A".repeat(2200)}${marker}`,
    );
    expect(excerpts[0]?.content.startsWith("A")).toBe(true);
    expect(excerpts[0]?.content).toContain("…");
    expect(excerpts[0]?.content).toContain(marker);
  });
});