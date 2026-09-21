import type { FileEntry, FileWatchEvent } from "../filesystem/fileTypes";
import { BINARY_EXTENSIONS } from "../filesystem/fileTypes";
import { extensionOf, resolveProjectPath } from "../filesystem/pathUtils";
import type { NativeFileEntry } from "../../types/tauri";
import { listenEvent, TAURI_EVENTS } from "./events";
import { projectApi } from "./projectApi";

export function toFileEntry(entry: NativeFileEntry): FileEntry {
  return {
    name: entry.name,
    path: entry.relativePath || entry.path,
    relativePath: entry.relativePath || entry.path,
    kind: entry.kind ?? (entry.isDirectory ? "directory" : "file"),
    extension: entry.extension ?? extensionOf(entry.name),
  };
}

export const filesystemApi = {
  listDirectory: async (projectRoot: string, relativePath: string, showExcluded = false) => {
    resolveProjectPath(projectRoot, relativePath);
    const entries = await projectApi.listFiles(relativePath, showExcluded);
    return entries.map(toFileEntry);
  },
  readFile: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    const extension = extensionOf(relativePath);
    if (extension && BINARY_EXTENSIONS.has(extension)) {
      throw new Error("Binary file");
    }
    return projectApi.readFile(relativePath);
  },
  writeFile: async (projectRoot: string, relativePath: string, content: string) => {
    resolveProjectPath(projectRoot, relativePath);
    await projectApi.writeFile(relativePath, content);
  },
  createFile: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    await projectApi.createFile(relativePath);
  },
  createDirectory: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    await projectApi.createDirectory(relativePath);
  },
  rename: async (projectRoot: string, relativePath: string, newRelativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    resolveProjectPath(projectRoot, newRelativePath);
    await projectApi.rename(relativePath, newRelativePath);
  },
  delete: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    await projectApi.delete(relativePath);
  },
  reveal: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    await projectApi.reveal(relativePath);
  },
  watch: async (_projectRoot: string, callback: (event: FileWatchEvent) => void) => {
    return listenEvent<FileWatchEvent>(TAURI_EVENTS.projectFileChanged, callback);
  },
  searchProjectFiles: async (projectRoot: string, query: string) => {
    resolveProjectPath(projectRoot, "");
    const entries = await projectApi.searchFiles(query);
    return entries.map(toFileEntry);
  },
  walkFiles: async (projectRoot: string, showExcluded = false) => {
    resolveProjectPath(projectRoot, "");
    return projectApi.walkFiles(showExcluded);
  },
  readBytes: async (projectRoot: string, relativePath: string) => {
    resolveProjectPath(projectRoot, relativePath);
    const encoded = await projectApi.readBytes(relativePath);
    return decodeBase64(encoded);
  },
};

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
}
