import { describe, expect, it } from "vitest";
import { PathOutsideProjectError, resolveProjectPath, toProjectRelative, joinRelativePath, sameFsPath } from "../pathUtils";

describe("resolveProjectPath", () => {
  const root = "C:/Projects/TodoApp";

  it("joins a relative file path", () => {
    expect(resolveProjectPath(root, "src/App.tsx")).toBe("C:/Projects/TodoApp/src/App.tsx");
  });

  it("accepts a directory path with a trailing slash", () => {
    expect(resolveProjectPath(root, "src/")).toBe("C:/Projects/TodoApp/src");
  });

  it("rejects parent-directory traversal", () => {
    expect(() => resolveProjectPath(root, "../secret.txt")).toThrow(PathOutsideProjectError);
    expect(() => resolveProjectPath(root, "../../secret.txt")).toThrow(PathOutsideProjectError);
    expect(() => resolveProjectPath(root, "src/../../secret.txt")).toThrow(PathOutsideProjectError);
  });

  it("rejects absolute paths outside the project", () => {
    expect(() => resolveProjectPath(root, "C:/Windows/System32/drivers/etc/hosts")).toThrow(PathOutsideProjectError);
    expect(() => resolveProjectPath(root, "/etc/passwd")).toThrow(PathOutsideProjectError);
    expect(() => resolveProjectPath(root, "C:/Projects/TodoApp-evil/secret.txt")).toThrow(PathOutsideProjectError);
  });

  it("accepts an absolute path that is the project or inside it", () => {
    expect(toProjectRelative(root, "C:\\Projects\\TodoApp")).toBe("");
    expect(toProjectRelative(root, "C:/Projects/TodoApp/backend")).toBe("backend");
    expect(resolveProjectPath(root, "c:/projects/todoapp/src/App.tsx")).toBe("C:/Projects/TodoApp/src/App.tsx");
  });

  it("joins names without leaving the parent", () => {
    expect(joinRelativePath("src", "TodoItem.tsx")).toBe("src/TodoItem.tsx");
    expect(() => joinRelativePath("src", "..")).toThrow(PathOutsideProjectError);
  });

  it("compares filesystem paths independently of separators", () => {
    expect(sameFsPath("C:/Projects/TodoApp", "C:\\Projects\\TodoApp\\")).toBe(true);
    expect(sameFsPath("C:/Projects/TodoApp", "C:/Projects/Other")).toBe(false);
  });
});
