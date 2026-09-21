import { gitService } from "../git/GitService";
import { isGitAuthError, withGitAuthRetry } from "../git/gitRecovery";
import { githubAuthService } from "./GitHubAuthService";
import { githubService } from "./GitHubService";
import { projectMetaApi } from "../tauri/accountApi";
import type { Project } from "../../types/project";
import type { ProjectGithubRepositoryRecord } from "../storage/types";

type ProjectStore = typeof import("../../stores/projectStore").useProjectStore;

async function projectStore(): Promise<ProjectStore> {
  const { useProjectStore } = await import("../../stores/projectStore");
  return useProjectStore;
}

function slugName(name: string) {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "kursor-project";
}

export async function refreshGitStatus() {
  try {
    const { useGitStore } = await import("../../stores/gitStore");
    await useGitStore.getState().refreshStatus();
  } catch {
    const useProjectStore = await projectStore();
    useProjectStore.getState().setGitStatus(null);
  }
}

function applyGithub(
  useProjectStore: ProjectStore,
  project: Project,
  owner: string,
  repo: string,
  defaultBranch?: string | null,
) {
  useProjectStore.getState().patchCurrentProject({
    githubOwner: owner,
    githubRepo: repo,
    defaultBranch: defaultBranch ?? project.defaultBranch,
  });
}

async function upsertGithub(
  project: Project,
  fields: Partial<ProjectGithubRepositoryRecord> & { owner: string; name: string },
) {
  const existing = await projectMetaApi.githubGet(project.id).catch(() => null);
  const record: ProjectGithubRepositoryRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    projectId: project.id,
    githubRepositoryId: fields.githubRepositoryId ?? existing?.githubRepositoryId ?? null,
    owner: fields.owner,
    name: fields.name,
    fullName: fields.fullName ?? `${fields.owner}/${fields.name}`,
    htmlUrl: fields.htmlUrl ?? existing?.htmlUrl ?? `https://github.com/${fields.owner}/${fields.name}`,
    cloneUrl: fields.cloneUrl ?? existing?.cloneUrl ?? null,
    defaultBranch: fields.defaultBranch ?? existing?.defaultBranch ?? "main",
    private: fields.private ?? existing?.private ?? 1,
  };
  await projectMetaApi.githubUpsert(record);
  applyGithub(await projectStore(), project, fields.owner, fields.name, record.defaultBranch);
}

export async function hasLiveGitHubSession(): Promise<boolean> {
  const user = await githubAuthService.getCurrentUser().catch(() => null);
  return Boolean(user);
}

let githubSignInInFlight: Promise<boolean> | null = null;
let githubAuthPrompted = false;

export function resetGitHubReconnectState() {
  githubSignInInFlight = null;
  githubAuthPrompted = false;
}

export async function reconnectGitHub(): Promise<boolean> {
  if (await hasLiveGitHubSession()) return true;
  if (githubSignInInFlight) return githubSignInInFlight;
  if (githubAuthPrompted) return false;
  return promptGitHubSignIn();
}

async function promptGitHubSignIn(): Promise<boolean> {
  if (await hasLiveGitHubSession()) return true;
  if (githubAuthPrompted && !githubSignInInFlight) return false;
  if (!githubSignInInFlight) {
    githubAuthPrompted = true;
    githubSignInInFlight = (async () => {
      const { useAccountStore } = await import("../../stores/accountStore");
      await useAccountStore.getState().signInGitHub({ ensureRepository: false });
      return hasLiveGitHubSession();
    })().finally(() => {
      githubSignInInFlight = null;
    });
  }
  try {
    return await githubSignInInFlight;
  } catch (error) {
    const useProjectStore = await projectStore();
    useProjectStore.getState().setGitError(
      error instanceof Error ? error.message : "GitHub sign-in failed.",
    );
    return false;
  }
}

async function ensureGitHubAccess(prompt: boolean): Promise<boolean> {
  if (await hasLiveGitHubSession()) return true;
  if (!prompt) return false;
  return promptGitHubSignIn();
}

export async function ensureGitHubRepository(
  project: Project,
  options?: { createIfMissing?: boolean; requireRemote?: boolean; promptSignIn?: boolean },
) {
  const createIfMissing = options?.createIfMissing !== false;
  const requireRemote = options?.requireRemote === true;
  const promptSignIn = options?.promptSignIn ?? requireRemote;
  const useProjectStore = await projectStore();
  useProjectStore.getState().setGitError(null);

  try {
    await associateOrCreateGithub(project, {
      createIfMissing,
      requireRemote,
      promptSignIn,
      retried: false,
    });
  } finally {
    if (requireRemote) {
      const current = useProjectStore.getState().currentProject;
      if (!useProjectStore.getState().gitError && (!current?.githubOwner || !current?.githubRepo)) {
        useProjectStore.getState().setGitError(
          "Unable to create or associate a GitHub repository. The local project was left unchanged.",
        );
      }
    }
    await refreshGitStatus();
  }
}

async function associateOrCreateGithub(
  project: Project,
  context: { createIfMissing: boolean; requireRemote: boolean; promptSignIn: boolean; retried: boolean },
) {
  const useProjectStore = await projectStore();

  const existing = await projectMetaApi.githubGet(project.id).catch(() => null);
  if (existing?.owner && existing.name) {
    const remotes = await gitService.remotes().catch(() => []);
    if (!remotes.some((remote) => remote.name === "origin") && existing.cloneUrl) {
      await gitService.addRemote("origin", existing.cloneUrl).catch(() => undefined);
    }
    applyGithub(useProjectStore, project, existing.owner, existing.name, existing.defaultBranch);
    return;
  }

  const remotes = await gitService.remotes().catch(() => []);
  const githubRemote =
    remotes.find((remote) => remote.name === "origin" && /github\.com/i.test(remote.url))
    ?? remotes.find((remote) => /github\.com/i.test(remote.url));
  const parsed = githubRemote ? gitService.parseGithubRemote(githubRemote.url) : null;
  if (parsed) {
    await upsertGithub(project, {
      owner: parsed.owner,
      name: parsed.repo,
      cloneUrl: githubRemote?.url,
      private: 1,
    });
    return;
  }

  if (!context.createIfMissing) return;

  const connected = await ensureGitHubAccess(context.promptSignIn);
  if (!connected) {
    if (context.requireRemote && !useProjectStore.getState().gitError) {
      useProjectStore.getState().setGitError("Connect GitHub to create a remote repository.");
    }
    return;
  }

  try {
    const isRepo = await gitService.isRepo().catch(() => false);
    if (!isRepo) await gitService.init();
    const repo = await githubService.createRepository(slugName(project.name), true);
    await gitService.addRemote("origin", repo.cloneUrl);
    await upsertGithub(project, {
      githubRepositoryId: repo.id,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      cloneUrl: repo.cloneUrl,
      defaultBranch: repo.defaultBranch,
      private: repo.private ? 1 : 0,
    });
    if (await gitService.hasCommits().catch(() => false)) {
      try {
        await withGitAuthRetry(() => gitService.push());
      } catch (error) {
        useProjectStore.getState().setGitError(
          error instanceof Error ? error.message : "Unable to push to GitHub.",
        );
      }
    }
  } catch (error) {
    if (!context.retried && context.promptSignIn && isGitAuthError(error)) {
      const signedIn = await promptGitHubSignIn();
      if (signedIn) {
        await associateOrCreateGithub(project, { ...context, retried: true });
        return;
      }
    }
    useProjectStore.getState().setGitError(
      error instanceof Error
        ? error.message
        : "Unable to create or associate a GitHub repository. The local project was left unchanged.",
    );
  }
}
