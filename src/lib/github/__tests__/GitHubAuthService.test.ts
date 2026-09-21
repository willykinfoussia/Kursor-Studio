import { describe, expect, it, vi } from "vitest";

vi.mock("../../tauri/invoke", () => ({
  isTauri: () => false,
}));

import { githubAuthService } from "../GitHubAuthService";

describe("GitHubAuthService local mock", () => {
  it("signs in and signs out without touching project data", async () => {
    expect(await githubAuthService.isAuthenticated()).toBe(false);
    const user = await githubAuthService.signIn();
    expect(user.login).toBe("local-dev");
    expect(await githubAuthService.isAuthenticated()).toBe(true);
    expect(await githubAuthService.getCurrentUser()).toEqual(user);
    await githubAuthService.signOut();
    expect(await githubAuthService.isAuthenticated()).toBe(false);
    expect(await githubAuthService.getCurrentUser()).toBeNull();
  });
});
