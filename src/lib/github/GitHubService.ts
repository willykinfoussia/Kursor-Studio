import { githubApi, type GitHubIssue, type GitHubPull, type GitHubRelease, type GitHubRepository, type GitHubUser } from "../tauri/githubApi";

export const githubService = {
  getCurrentUser(): Promise<GitHubUser | null> {
    return githubApi.currentUser();
  },
  listRepositories(query?: string): Promise<GitHubRepository[]> {
    return githubApi.listRepositories(query);
  },
  getRepository(owner: string, name: string): Promise<GitHubRepository> {
    return githubApi.getRepository(owner, name);
  },
  createRepository(name: string, privateRepo = true): Promise<GitHubRepository> {
    return githubApi.createRepository(name, privateRepo);
  },
  listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    return githubApi.listIssues(owner, repo);
  },
  createIssue(owner: string, repo: string, title: string, body?: string): Promise<GitHubIssue> {
    return githubApi.createIssue(owner, repo, title, body);
  },
  listPulls(owner: string, repo: string): Promise<GitHubPull[]> {
    return githubApi.listPulls(owner, repo);
  },
  createPull(owner: string, repo: string, title: string, head: string, base: string, body?: string): Promise<GitHubPull> {
    return githubApi.createPull(owner, repo, title, head, base, body);
  },
  listReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
    return githubApi.listReleases(owner, repo);
  },
  createRelease(owner: string, repo: string, tag: string, name?: string, body?: string): Promise<GitHubRelease> {
    return githubApi.createRelease(owner, repo, tag, name, body);
  },
};

export type { GitHubIssue, GitHubPull, GitHubRelease, GitHubRepository, GitHubUser };
