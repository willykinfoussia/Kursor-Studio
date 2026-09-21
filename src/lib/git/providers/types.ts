import { githubService, type GitHubIssue, type GitHubPull } from "../../github/GitHubService";
import { gitService } from "../GitService";
import { openExternalUrl } from "../../tauri/openUrl";

export type GitHostId = "github" | "gitlab" | "azure" | "bitbucket" | "unknown";

export interface GitHostProvider {
  id: GitHostId;
  label: string;
  detect(url: string): boolean;
  parseRemote(url: string): { owner: string; repo: string } | null;
  repoUrl(owner: string, repo: string): string;
  openRemote(url: string): Promise<void>;
  copyCloneUrl(url: string): Promise<void>;
  listPulls(owner: string, repo: string): Promise<GitHubPull[]>;
  listIssues(owner: string, repo: string): Promise<GitHubIssue[]>;
  createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string,
  ): Promise<GitHubPull>;
}

class UnsupportedProvider implements GitHostProvider {
  constructor(
    readonly id: GitHostId,
    readonly label: string,
    private readonly pattern: RegExp,
  ) {}

  detect(url: string) {
    return this.pattern.test(url);
  }

  parseRemote() {
    return null;
  }

  repoUrl() {
    return "";
  }

  async openRemote(): Promise<void> {
    throw new Error(`${this.label} is not connected yet.`);
  }

  async copyCloneUrl(): Promise<void> {
    throw new Error(`${this.label} is not connected yet.`);
  }

  async listPulls(): Promise<GitHubPull[]> {
    throw new Error(`${this.label} is not connected yet.`);
  }

  async listIssues(): Promise<GitHubIssue[]> {
    throw new Error(`${this.label} is not connected yet.`);
  }

  async createPullRequest(): Promise<GitHubPull> {
    throw new Error(`${this.label} is not connected yet.`);
  }
}

export const githubProvider: GitHostProvider = {
  id: "github",
  label: "GitHub",
  detect(url) {
    return /github\.com/i.test(url);
  },
  parseRemote(url) {
    return gitService.parseGithubRemote(url);
  },
  repoUrl(owner, repo) {
    return `https://github.com/${owner}/${repo}`;
  },
  async openRemote(url) {
    const parsed = gitService.parseGithubRemote(url);
    await openExternalUrl(parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : url);
  },
  async copyCloneUrl(url) {
    await navigator.clipboard.writeText(url);
  },
  listPulls(owner, repo) {
    return githubService.listPulls(owner, repo);
  },
  listIssues(owner, repo) {
    return githubService.listIssues(owner, repo);
  },
  createPullRequest(owner, repo, title, head, base, body) {
    return githubService.createPull(owner, repo, title, head, base, body);
  },
};

const gitlabProvider = new UnsupportedProvider("gitlab", "GitLab", /gitlab\.com/i);
const azureProvider = new UnsupportedProvider("azure", "Azure DevOps", /dev\.azure\.com|visualstudio\.com/i);
const bitbucketProvider = new UnsupportedProvider("bitbucket", "Bitbucket", /bitbucket\.org/i);

export const gitHostProviders: GitHostProvider[] = [
  githubProvider,
  gitlabProvider,
  azureProvider,
  bitbucketProvider,
];

export function detectGitHost(url?: string | null): GitHostProvider | null {
  if (!url) return null;
  return gitHostProviders.find((provider) => provider.detect(url)) ?? null;
}
