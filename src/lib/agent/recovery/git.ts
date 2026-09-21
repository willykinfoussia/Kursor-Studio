import { projectApi } from "../../tauri/projectApi";
import type { RecoveryGit } from "./types";

export const nativeRecoveryGit: RecoveryGit = {
  async isRepo() {
    try {
      return await projectApi.gitIsRepo();
    } catch {
      return false;
    }
  },
  async stashCreate() {
    const sha = await projectApi.gitStashCreate();
    return sha.trim() || null;
  },
  showPath(sha, path) {
    return projectApi.gitShowPath(sha, path).then((result) => result.content);
  },
  restorePaths(sha, paths) {
    return projectApi.gitRestorePaths(sha, paths);
  },
};
