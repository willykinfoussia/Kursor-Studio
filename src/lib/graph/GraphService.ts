import { BINARY_EXTENSIONS } from "../filesystem/fileTypes";
import { extensionOf, fileName, parentRelativePath } from "../filesystem/pathUtils";
import { fileSystemService } from "../filesystem/FileSystemService";
import { ProjectGraph } from "./ProjectGraph";
import { type SpecKind } from "./classify";
import { contextResolver } from "./ContextResolver";
import { createSpecGroup, listSpecGroups, writeNewSpec } from "./createSpec";
import { createAccountSpecsStore, createMergedGraphStore } from "./mergedStore";
import { isGraphCachePath, shouldIndexPath } from "./scanner/FileScanner";
import type { GraphFileStore, ResolvedContext, TraversalOptions, WalkedFile } from "./types";

const RENAME_WINDOW_MS = 2000;

interface RemovalRecord {
  path: string;
  hash: string;
  at: number;
}

export function createFilesystemGraphStore(): GraphFileStore {
  return {
    async walkFiles() {
      if ("walkFiles" in fileSystemService) {
        return fileSystemService.walkFiles();
      }
      return walkByListing("");
    },
    readFile: (path) => fileSystemService.readFile(path),
    readBytes: (path) => fileSystemService.readBytes(path),
    writeFile: (path, content) => fileSystemService.writeFile(path, content),
    createDirectory: (path) => fileSystemService.createDirectory(path),
    delete: (path) => fileSystemService.delete(path),
    listDirectory: async (path) => {
      const entries = await fileSystemService.listDirectory(path);
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.relativePath || entry.path,
        kind: entry.kind,
      }));
    },
  };
}

export function createProductionGraphStore(): GraphFileStore {
  return createMergedGraphStore(createFilesystemGraphStore(), createAccountSpecsStore());
}

async function walkByListing(path: string): Promise<WalkedFile[]> {
  const entries = await fileSystemService.listDirectory(path);
  const files: WalkedFile[] = [];
  for (const entry of entries) {
    const relative = entry.relativePath || entry.path;
    if (entry.kind === "directory") {
      files.push(...await walkByListing(relative));
    } else {
      files.push({ relativePath: relative, size: 0, modifiedAt: 0 });
    }
  }
  return files;
}

class GraphService {
  private graph: ProjectGraph | null = null;
  private files: GraphFileStore | null = null;
  private projectId: string | null = null;
  private removals: RemovalRecord[] = [];
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getGraph(): ProjectGraph | null {
    return this.graph;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  getFiles(): GraphFileStore {
    this.files ??= createProductionGraphStore();
    return this.files;
  }

  async rebuild(projectId: string): Promise<void> {
    this.projectId = projectId;
    this.files = createProductionGraphStore();
    this.graph = new ProjectGraph({ files: this.files });
    await this.graph.rebuild();
    this.emit();
  }

  async updateFile(projectId: string, filePath: string, kind = "modify"): Promise<void> {
    if (this.projectId !== projectId || !this.graph) return;
    if (isGraphCachePath(filePath)) return;
    if (kind === "remove") {
      const node = this.graph.getNode(filePath);
      this.removals.push({ path: filePath, hash: node?.hash ?? "", at: Date.now() });
      this.pruneRemovals();
      await this.graph.removeFile(filePath);
      this.emit();
      return;
    }
    if (!shouldIndexPath(filePath) && !this.graph.getNode(filePath)) return;
    if (kind === "create") {
      const renamed = await this.tryRename(filePath);
      if (renamed) {
        this.emit();
        return;
      }
    }
    await this.graph.updateFile(filePath);
    this.emit();
  }

  async removeFile(projectId: string, filePath: string): Promise<void> {
    await this.updateFile(projectId, filePath, "remove");
  }

  async createSpec(options: { scope: "account" | "project"; kind?: SpecKind; group?: string; fileName: string }): Promise<string> {
    const path = await writeNewSpec(this.getFiles(), options);
    const projectId = this.projectId;
    if (projectId) await this.updateFile(projectId, path, "create");
    else this.emit();
    return path;
  }

  async createSpecGroup(scope: "account" | "project", group: string): Promise<string> {
    const path = await createSpecGroup(this.getFiles(), scope, group);
    this.emit();
    return path;
  }

  async listSpecGroups(scope: "account" | "project"): Promise<string[]> {
    return listSpecGroups(this.getFiles(), scope);
  }

  resolveContext(seeds: { query?: string; paths?: string[] }, options?: TraversalOptions): ResolvedContext {
    if (!this.graph) return { root: seeds.paths?.[0] ?? "", files: [] };
    return contextResolver.resolve(this.graph, seeds, options);
  }

  private async tryRename(newPath: string): Promise<boolean> {
    if (!this.graph) return false;
    await this.graph.updateFile(newPath);
    const created = this.graph.getNode(newPath);
    if (!created?.hash) return false;
    const match = this.removals.find((item) => item.hash && item.hash === created.hash && item.path !== newPath);
    if (!match) return false;
    this.removals = this.removals.filter((item) => item !== match);
    return true;
  }

  private pruneRemovals() {
    const cutoff = Date.now() - RENAME_WINDOW_MS;
    this.removals = this.removals.filter((item) => item.at >= cutoff);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export const graphService = new GraphService();

export function fileLabel(path: string): string {
  return fileName(path) || path;
}

export function parentPath(path: string): string {
  return parentRelativePath(path);
}

export function isBinaryGraphFile(path: string): boolean {
  const extension = extensionOf(path);
  return Boolean(extension && BINARY_EXTENSIONS.has(extension));
}
