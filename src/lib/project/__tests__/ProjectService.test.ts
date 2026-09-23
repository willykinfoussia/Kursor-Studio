import { describe, expect, it } from "vitest";
import { isMissingProject, mapProjectInfo, projectTypeFromEntries } from "../ProjectService";

describe("projectTypeFromEntries", () => {
  it("detects common project markers", () => {
    expect(projectTypeFromEntries([{ name: "package.json", path: "package.json", relativePath: "package.json", kind: "file" }])).toBe("Node");
    expect(projectTypeFromEntries([{ name: "Cargo.toml", path: "Cargo.toml", relativePath: "Cargo.toml", kind: "file" }])).toBe("Rust");
    expect(projectTypeFromEntries([{ name: "pyproject.toml", path: "pyproject.toml", relativePath: "pyproject.toml", kind: "file" }])).toBe("Python");
    expect(projectTypeFromEntries([{ name: "README.md", path: "README.md", relativePath: "README.md", kind: "file" }])).toBeNull();
  });
});

describe("mapProjectInfo", () => {
  it("treats omitted exists as present and maps a missing folder", () => {
    expect(mapProjectInfo({ id: "1", name: "App", rootPath: "/app" }).exists).toBe(true);
    expect(mapProjectInfo({ id: "1", name: "App", rootPath: "/app", exists: false }).exists).toBe(false);
    expect(isMissingProject({ exists: false })).toBe(true);
    expect(isMissingProject({ exists: true })).toBe(false);
  });
});
