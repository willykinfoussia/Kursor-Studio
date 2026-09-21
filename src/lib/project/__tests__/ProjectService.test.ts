import { describe, expect, it } from "vitest";
import { projectTypeFromEntries } from "../ProjectService";

describe("projectTypeFromEntries", () => {
  it("detects common project markers", () => {
    expect(projectTypeFromEntries([{ name: "package.json", path: "package.json", relativePath: "package.json", kind: "file" }])).toBe("Node");
    expect(projectTypeFromEntries([{ name: "Cargo.toml", path: "Cargo.toml", relativePath: "Cargo.toml", kind: "file" }])).toBe("Rust");
    expect(projectTypeFromEntries([{ name: "pyproject.toml", path: "pyproject.toml", relativePath: "pyproject.toml", kind: "file" }])).toBe("Python");
    expect(projectTypeFromEntries([{ name: "README.md", path: "README.md", relativePath: "README.md", kind: "file" }])).toBeNull();
  });
});
