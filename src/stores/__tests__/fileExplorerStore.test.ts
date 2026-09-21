import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectFile } from "../../types/project";
import { useFileExplorerStore } from "../fileExplorerStore";

function file(path: string, children?: ProjectFile[]): ProjectFile {
  const name = path.split("/").pop() || "app";
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
    ]),
    file("extra.ts"),
  ]),
];

describe("fileExplorerStore selection", () => {
  beforeEach(() => {
    useFileExplorerStore.setState({
      files: tree,
      expanded: new Set(["root", "src"]),
      selectedFile: null,
      selectedFiles: [],
      selectionAnchor: null,
      loadingPaths: new Set(),
      status: null,
    });
  });

  it("selectFile replaces the selection", () => {
    useFileExplorerStore.getState().selectFile("src/a.ts");
    useFileExplorerStore.getState().toggleSelect("src/b.ts");
    useFileExplorerStore.getState().selectFile("readme.md");
    expect(useFileExplorerStore.getState().selectedFile).toBe("readme.md");
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["readme.md"]);
    expect(useFileExplorerStore.getState().selectionAnchor).toBe("readme.md");
  });

  it("toggleSelect adds and removes paths", () => {
    useFileExplorerStore.getState().selectFile("src/a.ts");
    useFileExplorerStore.getState().toggleSelect("src/b.ts");
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    useFileExplorerStore.getState().toggleSelect("src/a.ts");
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["src/b.ts"]);
    expect(useFileExplorerStore.getState().selectedFile).toBe("src/a.ts");
  });

  it("selectRange uses visible rows from the anchor", () => {
    useFileExplorerStore.getState().selectFile("readme.md");
    useFileExplorerStore.getState().selectRange("src/b.ts");
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["readme.md", "src", "src/a.ts", "src/b.ts"]);
    expect(useFileExplorerStore.getState().selectionAnchor).toBe("readme.md");
  });

  it("selectAllVisible covers expanded rows", () => {
    useFileExplorerStore.getState().selectAllVisible();
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["", "readme.md", "src", "src/a.ts", "src/b.ts", "extra.ts"]);
  });

  it("clearToPrimary collapses to the focused path", () => {
    useFileExplorerStore.getState().selectFile("src/a.ts");
    useFileExplorerStore.getState().toggleSelect("src/b.ts");
    useFileExplorerStore.getState().clearToPrimary();
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["src/b.ts"]);
  });

  it("reset clears selection", () => {
    useFileExplorerStore.getState().selectFile("src/a.ts");
    useFileExplorerStore.getState().reset();
    expect(useFileExplorerStore.getState().selectedFile).toBeNull();
    expect(useFileExplorerStore.getState().selectedFiles).toEqual([]);
    expect(useFileExplorerStore.getState().files).toEqual([]);
  });

  it("moveSelection walks visible rows and extends from the anchor", () => {
    useFileExplorerStore.getState().selectFile("readme.md");
    useFileExplorerStore.getState().moveSelection(1, false);
    expect(useFileExplorerStore.getState().selectedFile).toBe("src");
    useFileExplorerStore.getState().moveSelection(1, true);
    expect(useFileExplorerStore.getState().selectedFiles).toEqual(["src", "src/a.ts"]);
    expect(useFileExplorerStore.getState().selectionAnchor).toBe("src");
  });
});
