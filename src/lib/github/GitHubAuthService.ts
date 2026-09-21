import { isTauri } from "../tauri/invoke";
import { githubApi, type GitHubUser } from "../tauri/githubApi";

export interface GitHubAuthService {
  signIn(): Promise<GitHubUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<GitHubUser | null>;
  isAuthenticated(): Promise<boolean>;
}

class DesktopGitHubAuthService implements GitHubAuthService {
  signIn() {
    return githubApi.signIn();
  }
  signOut() {
    return githubApi.signOut();
  }
  getCurrentUser() {
    return githubApi.currentUser();
  }
  isAuthenticated() {
    return githubApi.isAuthenticated();
  }
}

class LocalGitHubAuthService implements GitHubAuthService {
  private user: GitHubUser | null = null;
  async signIn() {
    this.user = { id: "mock", login: "local-dev", name: "Local Dev", avatarUrl: null, email: null };
    return this.user;
  }
  async signOut() {
    this.user = null;
  }
  async getCurrentUser() {
    return this.user;
  }
  async isAuthenticated() {
    return Boolean(this.user);
  }
}

const desktop = new DesktopGitHubAuthService();
const local = new LocalGitHubAuthService();

export const githubAuthService: GitHubAuthService = {
  signIn: () => (isTauri() ? desktop : local).signIn(),
  signOut: () => (isTauri() ? desktop : local).signOut(),
  getCurrentUser: () => (isTauri() ? desktop : local).getCurrentUser(),
  isAuthenticated: () => (isTauri() ? desktop : local).isAuthenticated(),
};
