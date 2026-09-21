import { toUserError } from "../errors";
import { BINARY_EXTENSIONS, type FileEntry, type FileWatchEvent } from "./fileTypes";
import { extensionOf, parentRelativePath } from "./pathUtils";
import { filesystemApi } from "../tauri/filesystemApi";
import type { WalkedFile } from "../../types/tauri";

let rootGetter: () => string | null = () => null;

export function setProjectRootGetter(getter: () => string | null) {
  rootGetter = getter;
}

export interface FileSystemService {
  listDirectory(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  rename(path: string, newPath: string): Promise<void>;
  delete(path: string): Promise<void>;
  watch(path: string, callback: (event: FileWatchEvent) => void): Promise<() => void>;
  searchFiles(query: string, known: FileEntry[]): FileEntry[];
  searchProjectFiles(query: string): Promise<FileEntry[]>;
  walkFiles(): Promise<WalkedFile[]>;
  isBinaryPath(path: string): boolean;
}

function requireRoot(rootPath: string | null | undefined) {
  if (!rootPath) throw new Error("No project is currently open.");
  return rootPath;
}

async function ensureParentDirectories(
  relativePath: string,
  createDirectory: (path: string) => Promise<void>,
) {
  const parent = parentRelativePath(relativePath);
  if (!parent) return;
  const parts = parent.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await createDirectory(current);
    } catch {
      // Directory already exists, or the subsequent write/create reports the real error.
    }
  }
}

export function createFileSystemService(getRootPath: () => string | null): FileSystemService {
  return {
    async listDirectory(path) {
      try {
        return await filesystemApi.listDirectory(
          requireRoot(getRootPath()),
          path,
          (await import("../../stores/settingsStore")).useSettingsStore.getState().showExcludedDirectories,
        );
      } catch (error) {
        throw new Error(toUserError(error, "Unable to read file."));
      }
    },
    async readFile(path) {
      try {
        return await filesystemApi.readFile(requireRoot(getRootPath()), path);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to read file."));
      }
    },
    async readBytes(path) {
      try {
        return await filesystemApi.readBytes(requireRoot(getRootPath()), path);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to read file."));
      }
    },
    async writeFile(path, content) {
      try {
        const root = requireRoot(getRootPath());
        await ensureParentDirectories(path, (directory) => filesystemApi.createDirectory(root, directory));
        await filesystemApi.writeFile(root, path, content);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to save file."));
      }
    },
    async createFile(path) {
      try {
        const root = requireRoot(getRootPath());
        await ensureParentDirectories(path, (directory) => filesystemApi.createDirectory(root, directory));
        await filesystemApi.createFile(root, path);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to create the file."));
      }
    },
    async createDirectory(path) {
      try {
        const root = requireRoot(getRootPath());
        await ensureParentDirectories(path, (directory) => filesystemApi.createDirectory(root, directory));
        await filesystemApi.createDirectory(root, path);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to create the folder."));
      }
    },
    async rename(path, newPath) {
      try {
        await filesystemApi.rename(requireRoot(getRootPath()), path, newPath);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to rename."));
      }
    },
    async delete(path) {
      try {
        await filesystemApi.delete(requireRoot(getRootPath()), path);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to delete."));
      }
    },
    async watch(_path, callback) {
      return filesystemApi.watch(requireRoot(getRootPath()), callback);
    },
    searchFiles(query, known) {
      const needle = query.trim().toLowerCase();
      if (!needle) return known.filter((entry) => entry.kind === "file");
      return known.filter((entry) => {
        if (entry.kind !== "file") return false;
        return entry.name.toLowerCase().includes(needle) || entry.relativePath.toLowerCase().includes(needle);
      });
    },
    async searchProjectFiles(query) {
      try {
        return await filesystemApi.searchProjectFiles(requireRoot(getRootPath()), query);
      } catch (error) {
        throw new Error(toUserError(error, "Unable to search files."));
      }
    },
    async walkFiles() {
      try {
        return await filesystemApi.walkFiles(requireRoot(getRootPath()));
      } catch (error) {
        throw new Error(toUserError(error, "Unable to read file."));
      }
    },
    isBinaryPath(path) {
      const extension = extensionOf(path);
      return Boolean(extension && BINARY_EXTENSIONS.has(extension));
    },
  };
}

export const fileSystemService = createFileSystemService(() => rootGetter());
