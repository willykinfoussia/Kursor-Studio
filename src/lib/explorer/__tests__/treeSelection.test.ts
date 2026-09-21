import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../../../types/project";
import { findProjectFile, pruneNestedPaths, rangePaths, visibleRows } from "../treeSelection";

function file(path: string, children?: ProjectFile[]): ProjectFile {
  const name = path.split("/").pop() || "root";
  return {
    id: path || "root",
    name,
    path,
    kind: children ? "directory" : "file",
    loaded: true,
    children,
  };
}

const tree: ProjectFile[] = [
  file("", [
    file("readme.md"),
    file("src", [
      file("src/a.ts"),
      file("src/b.ts"),
      file("src/nested", [file("src/nested/c.ts")]),
    ]),
    file("extra.ts"),
  ]),
];

describe("visibleRows", () => {
  it("omits children of collapsed directories", () => {
    const rows = visibleRows(tree, new Set(["root"]));
    expect(rows.map((row) => row.path)).toEqual(["", "readme.md", "src", "extra.ts"]);
  });

  it("includes nested children when expanded", () => {
    const rows = visibleRows(tree, new Set(["root", "src"]));
    expect(rows.map((row) => row.path)).toEqual(["", "readme.md", "src", "src/a.ts", "src/b.ts", "src/nested", "extra.ts"]);
  });
});

describe("rangePaths", () => {
  it("returns the inclusive visible range", () => {
    const rows = visibleRows(tree, new Set(["root", "src"]));
    expect(rangePaths(rows, "readme.md", "src/b.ts")).toEqual(["readme.md", "src", "src/a.ts", "src/b.ts"]);
  });

  it("works backwards", () => {
    const rows = visibleRows(tree, new Set(["root"]));
    expect(rangePaths(rows, "extra.ts", "readme.md")).toEqual(["readme.md", "src", "extra.ts"]);
  });
});

describe("pruneNestedPaths", () => {
  it("drops children when a parent folder is selected", () => {
    expect(pruneNestedPaths(["src", "src/a.ts", "readme.md"])).toEqual(["src", "readme.md"]);
  });

  it("does not treat a similar prefix as a parent", () => {
    expect(pruneNestedPaths(["src", "src-extra"])).toEqual(["src", "src-extra"]);
  });
});

describe("findProjectFile", () => {
  it("finds a nested file by path", () => {
    expect(findProjectFile(tree, "src/b.ts")?.name).toBe("b.ts");
  });
});
