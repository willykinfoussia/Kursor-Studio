import { describe, expect, it } from "vitest";
import { gitService } from "../GitService";

describe("GitHub mock association", () => {
  it("parses a GitHub remote without cloning", () => {
    expect(gitService.parseGithubRemote("git@github.com:willy/TodoApp.git")).toEqual({
      owner: "willy",
      repo: "TodoApp",
    });
    expect(gitService.parseGithubRemote("https://github.com/willy/MyWebsite.git")).toEqual({
      owner: "willy",
      repo: "MyWebsite",
    });
  });

  it("fills file metadata when porcelain files are missing", () => {
    expect(gitService.files({ branch: "main", changedFiles: ["src/App.tsx"], clean: false })[0]).toMatchObject({
      path: "src/App.tsx",
      kind: "M",
      staged: false,
    });
  });
});
