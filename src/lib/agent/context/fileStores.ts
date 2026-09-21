import { fileSystemService } from "../../filesystem/FileSystemService";
import { userDataApi } from "../../tauri/userDataApi";
import type { ContextFileStore } from "./types";

export function projectContextFiles(): ContextFileStore {
  return {
    readFile: (path) => fileSystemService.readFile(path),
    listDirectory: async (path) => {
      const entries = await fileSystemService.listDirectory(path);
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.relativePath || entry.path,
        kind: entry.kind === "directory" ? "directory" as const : "file" as const,
      }));
    },
  };
}

export function userContextFiles(): ContextFileStore {
  return {
    readFile: async (path) => {
      const parsed = splitUserDataPath(path);
      if (!parsed) throw new Error(`missing ${path}`);
      const content = await userDataApi.read(parsed.kind, parsed.relative);
      if (!content.trim()) throw new Error(`missing ${path}`);
      return content;
    },
    listDirectory: async (path) => {
      const parsed = splitUserDataPath(path);
      if (!parsed || parsed.relative) return [];
      const entries = await userDataApi.list(parsed.kind);
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind === "directory" ? "directory" as const : "file" as const,
      }));
    },
  };
}

export function splitUserDataPath(path: string): { kind: "skills" | "rules"; relative: string } | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\//, "");
  const [kind, ...rest] = normalized.split("/");
  if (kind !== "skills" && kind !== "rules") return null;
  return { kind, relative: rest.join("/") };
}
