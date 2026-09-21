import { githubApi } from "../../tauri/githubApi";
import { availableGitHubToolsets, type GitHubAccess, type GitHubSettings } from "../builtin/github";
import { systemDetector } from "./ExecutableLocator";
import type { SystemDetector } from "./types";

export class GitHubSetupService {
  constructor(private readonly detector: SystemDetector = systemDetector) {}

  async account() {
    const connected = await githubApi.isAuthenticated().catch(() => false);
    const user = connected ? await githubApi.currentUser().catch(() => null) : null;
    return { connected, username: user?.login ?? null };
  }

  async detectDocker() {
    return this.detector.which("docker");
  }

  accessFromMode(access: GitHubAccess): Partial<GitHubSettings> {
    if (access === "read-only") {
      return { access, readOnly: true };
    }
    return { access, readOnly: false };
  }

  toolsetsFor(settings: GitHubSettings) {
    const available = availableGitHubToolsets(settings);
    const context = ["context", "repos", "issues", "pull_requests", "users"];
    const advanced = available.filter((item) => !context.includes(item));
    return { context: available.filter((item) => context.includes(item)), advanced };
  }
}

export const githubSetupService = new GitHubSetupService();
