import { describe, expect, it } from "vitest";
import { gitAuthErrorCopy, gitInstallUrl, isGitAuthError, isGitMissingError } from "../gitRecovery";

describe("gitRecovery classifiers", () => {
  it("detects git authentication failures", () => {
    expect(isGitAuthError(new Error("Git authentication failed."))).toBe(true);
    expect(isGitAuthError("remote: Invalid credentials\nfatal: Authentication failed")).toBe(true);
    expect(isGitAuthError("fatal: could not read Username for 'https://github.com'")).toBe(true);
    expect(isGitAuthError("GitHub is not connected.")).toBe(true);
    expect(isGitAuthError("bad credentials")).toBe(true);
    expect(isGitAuthError("rejected non-fast-forward")).toBe(false);
  });

  it("detects a missing git binary", () => {
    expect(isGitMissingError(new Error("Git is not available."))).toBe(true);
    expect(isGitMissingError("Unable to read git status.")).toBe(false);
  });

  it("picks an install URL for the current platform", () => {
    expect(gitInstallUrl("MacIntel")).toBe("https://git-scm.com/download/mac");
    expect(gitInstallUrl("Linux x86_64")).toBe("https://git-scm.com/download/linux");
    expect(gitInstallUrl("Win32")).toBe("https://git-scm.com/download/win");
  });

  it("explains auth errors without asking to reconnect a live session", () => {
    expect(gitAuthErrorCopy(true, false, null)).toBe("Git could not use the connected GitHub account.");
    expect(gitAuthErrorCopy(false, false, null)).toBe("GitHub authentication failed. Connect GitHub to continue.");
    expect(gitAuthErrorCopy(false, true, "Opening GitHub…")).toBe("Opening GitHub…");
  });
});
