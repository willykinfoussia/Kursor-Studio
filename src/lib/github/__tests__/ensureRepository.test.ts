import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tauri/invoke", () => ({
  isTauri: () => false,
  toErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
}));

vi.mock("../GitHubAuthService", () => ({
  githubAuthService: {
    signIn: vi.fn(async () => ({ id: "1", login: "test-user", name: "Test", avatarUrl: null, email: null })),
    signOut: vi.fn(async () => undefined),
    getCurrentUser: vi.fn(async () => ({ id: "1", login: "octo", name: "Octo", avatarUrl: null, email: null })),
    isAuthenticated: vi.fn(async () => true),
  },
}));

import { reconnectGitHub, resetGitHubReconnectState } from "../ensureRepository";
import { githubAuthService } from "../GitHubAuthService";

const liveUser = { id: "1", login: "octo", name: "Octo", avatarUrl: null, email: null };

describe("reconnectGitHub", () => {
  beforeEach(() => {
    resetGitHubReconnectState();
    vi.mocked(githubAuthService.signIn).mockReset();
    vi.mocked(githubAuthService.signIn).mockResolvedValue({
      id: "1",
      login: "test-user",
      name: "Test",
      avatarUrl: null,
      email: null,
    });
    vi.mocked(githubAuthService.getCurrentUser).mockReset();
    vi.mocked(githubAuthService.getCurrentUser).mockResolvedValue(liveUser);
  });

  it("reuses a valid GitHub account session without signing in again", async () => {
    await expect(reconnectGitHub()).resolves.toBe(true);
    expect(githubAuthService.signIn).not.toHaveBeenCalled();
    expect(githubAuthService.getCurrentUser).toHaveBeenCalled();
  });

  it("signs in when the GitHub profile cannot be loaded", async () => {
    vi.mocked(githubAuthService.getCurrentUser)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(liveUser);
    await expect(reconnectGitHub()).resolves.toBe(true);
    expect(githubAuthService.signIn).toHaveBeenCalled();
  });

  it("does not open another sign-in after the overlay already ran", async () => {
    vi.mocked(githubAuthService.getCurrentUser).mockResolvedValue(null);
    await expect(reconnectGitHub()).resolves.toBe(false);
    await expect(reconnectGitHub()).resolves.toBe(false);
    expect(githubAuthService.signIn).toHaveBeenCalledTimes(1);
  });
});
