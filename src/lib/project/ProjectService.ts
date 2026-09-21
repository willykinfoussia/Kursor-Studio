import type { Project } from "../../types/project";
import type { ProjectInfo } from "../../types/tauri";
import { toUserError } from "../errors";
import { projectApi } from "../tauri/projectApi";
import { projectMetaApi } from "../tauri/accountApi";
import { gitApi } from "../tauri/githubApi";
import type { FileEntry } from "../filesystem/fileTypes";

export function projectTypeFromEntries(entries: FileEntry[]): string | null {
  const names = new Set(entries.map((entry) => entry.name));
  if (names.has("package.json")) return "Node";
  if (names.has("pyproject.toml") || names.has("requirements.txt")) return "Python";
  if (names.has("Cargo.toml")) return "Rust";
  if (names.has("go.mod")) return "Go";
  if (names.has("pom.xml")) return "Java";
  return null;
}

export function mapProjectInfo(info: ProjectInfo): Project {
  return {
    id: info.id,
    accountId: info.accountId ?? "local-account",
    name: info.name,
    rootPath: info.rootPath,
    localPath: info.rootPath,
    githubOwner: info.githubOwner,
    githubRepo: info.githubRepo,
    defaultBranch: info.defaultBranch,
    projectType: info.projectType,
    createdAt: info.createdAt,
    updatedAt: info.updatedAt,
    lastOpenedAt: info.lastOpenedAt,
  };
}

export async function detectProjectType(_rootPath: string) {
  return projectService.detectType();
}

export const projectService = {
  async pickDirectory() {
    return projectApi.pickDirectory();
  },
  async open(path: string): Promise<Project> {
    try {
      return mapProjectInfo(await projectApi.open(path));
    } catch (error) {
      throw new Error(toUserError(error, "Project directory no longer exists."));
    }
  },
  async listRecent(): Promise<Project[]> {
    try {
      return (await projectApi.listRecent()).map(mapProjectInfo);
    } catch {
      return [];
    }
  },
  async list(): Promise<Project[]> {
    try {
      return (await projectApi.list()).map(mapProjectInfo);
    } catch {
      return [];
    }
  },
  async remove(id: string) {
    await projectApi.remove(id);
  },
  async createFolder(path: string) {
    await gitApi.createFolder(path);
  },
  async detectType() {
    try {
      return await projectApi.detectType();
    } catch {
      return null;
    }
  },
  getByPath: (path: string) => projectMetaApi.getByPath(path),
};
