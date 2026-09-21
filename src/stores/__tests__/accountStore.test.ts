import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tauri/accountApi", () => ({
  accountApi: {
    current: vi.fn(async () => ({
      id: "local-account",
      provider: "local",
      username: "local",
      displayName: "Local Account",
      avatarUrl: null,
      onboarded: 0,
      createdAt: 1,
      updatedAt: 1,
    })),
    upsert: vi.fn(async (account) => account),
    markOnboarded: vi.fn(async () => ({
      id: "local-account",
      provider: "local",
      username: "local",
      displayName: "Local Account",
      avatarUrl: null,
      onboarded: 1,
      createdAt: 1,
      updatedAt: 2,
    })),
    githubAccount: vi.fn(async () => null),
  },
}));

vi.mock("../../lib/github/GitHubAuthService", () => ({
  githubAuthService: {
    signIn: vi.fn(async () => ({ id: "1", login: "test-user", name: "Test", avatarUrl: null, email: null })),
    signOut: vi.fn(async () => undefined),
    getCurrentUser: vi.fn(async () => null),
    isAuthenticated: vi.fn(async () => false),
  },
}));

vi.mock("../../lib/github/ensureRepository", () => ({
  ensureGitHubRepository: vi.fn(async () => undefined),
  refreshGitStatus: vi.fn(async () => undefined),
}));

import { parseGitHubSignInProgress, useAccountStore } from "../accountStore";
import { githubAuthService } from "../../lib/github/GitHubAuthService";

describe("accountStore", () => {
  beforeEach(() => {
    vi.mocked(githubAuthService.signIn).mockReset();
    vi.mocked(githubAuthService.signIn).mockResolvedValue({ id: "1", login: "test-user", name: "Test", avatarUrl: null, email: null });
    useAccountStore.setState({
      currentAccount: null,
      githubConnected: false,
      githubUsername: undefined,
      isLoading: false,
      statusMessage: null,
      deviceUserCode: null,
      deviceVerificationUri: null,
      error: null,
    });
  });

  it("creates and loads a local account", async () => {
    await useAccountStore.getState().hydrate();
    expect(useAccountStore.getState().currentAccount?.provider).toBe("local");
    await useAccountStore.getState().continueLocal();
    expect(useAccountStore.getState().currentAccount?.onboarded).toBe(true);
  });

  it("signs in with a GitHub mock and signs out without dropping the account", async () => {
    await useAccountStore.getState().signInGitHub();
    expect(githubAuthService.signIn).toHaveBeenCalled();
    expect(useAccountStore.getState().githubConnected).toBe(true);
    expect(useAccountStore.getState().githubUsername).toBe("test-user");
    await useAccountStore.getState().signOutGitHub();
    expect(githubAuthService.signOut).toHaveBeenCalled();
    expect(useAccountStore.getState().githubConnected).toBe(false);
    expect(useAccountStore.getState().currentAccount).toBeTruthy();
  });

  it("parses a structured device-code progress payload", () => {
    const parsed = parseGitHubSignInProgress({
      message: "Enter WDJB-MJHT in the browser to finish GitHub sign-in",
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
    });
    expect(parsed.deviceUserCode).toBe("WDJB-MJHT");
    expect(parsed.deviceVerificationUri).toBe("https://github.com/login/device");
  });

  it("extracts a device code from a plain progress message", () => {
    const parsed = parseGitHubSignInProgress("Enter ABCD-1234 in the browser to finish GitHub sign-in");
    expect(parsed.deviceUserCode).toBe("ABCD-1234");
    expect(parsed.statusMessage).toContain("ABCD-1234");
  });

  it("stores deviceUserCode from progress and clears it after a successful sign-in", async () => {
    useAccountStore.getState().applySignInProgress({
      message: "Enter WDJB-MJHT in the browser to finish GitHub sign-in",
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
    });
    expect(useAccountStore.getState().deviceUserCode).toBe("WDJB-MJHT");
    expect(useAccountStore.getState().deviceVerificationUri).toBe("https://github.com/login/device");
    await useAccountStore.getState().signInGitHub();
    expect(useAccountStore.getState().deviceUserCode).toBeNull();
    expect(useAccountStore.getState().deviceVerificationUri).toBeNull();
  });

  it("clears deviceUserCode when GitHub sign-in fails", async () => {
    vi.mocked(githubAuthService.signIn).mockRejectedValueOnce(new Error("denied"));
    useAccountStore.getState().applySignInProgress({
      message: "Enter WDJB-MJHT in the browser to finish GitHub sign-in",
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
    });
    await expect(useAccountStore.getState().signInGitHub()).rejects.toThrow("denied");
    expect(useAccountStore.getState().deviceUserCode).toBeNull();
    expect(useAccountStore.getState().deviceVerificationUri).toBeNull();
    expect(useAccountStore.getState().error).toBe("denied");
  });
});
