import { fromUserSpecsRelative, isAccountVirtualPath, toUserSpecsRelative } from "./classify";
import { userDataApi } from "../tauri/userDataApi";
import type { GraphFileStore, WalkedFile } from "./types";

function walkAccountSpecs(): Promise<WalkedFile[]> {
  return userDataApi.walk("specs")
    .then((entries) => entries
      .filter((entry) => entry.relativePath.replace(/\\/g, "/").startsWith("account/"))
      .map((entry) => ({
        relativePath: fromUserSpecsRelative(entry.relativePath),
        size: entry.size,
        modifiedAt: entry.modifiedAt,
      })))
    .catch(() => []);
}

export function createAccountSpecsStore(): GraphFileStore {
  return {
    walkFiles: walkAccountSpecs,
    async readFile(path) {
      return userDataApi.read("specs", toUserSpecsRelative(path));
    },
    async readBytes(path) {
      const text = await userDataApi.read("specs", toUserSpecsRelative(path));
      return new TextEncoder().encode(text);
    },
    async writeFile(path, content) {
      await userDataApi.write("specs", toUserSpecsRelative(path), content);
    },
    async createDirectory(path) {
      const relative = `${toUserSpecsRelative(path)}/.keep`;
      await userDataApi.create("specs", relative);
    },
    async delete(path) {
      await userDataApi.delete("specs", toUserSpecsRelative(path));
    },
    async listDirectory(path) {
      const prefix = path.replace(/\\/g, "/").replace(/\/+$/, "");
      const walked = await walkAccountSpecs();
      const children = new Map<string, { name: string; path: string; kind: "file" | "directory" }>();
      for (const entry of walked) {
        const relative = entry.relativePath.replace(/\\/g, "/");
        if (relative === prefix || !relative.startsWith(`${prefix}/`)) continue;
        const rest = relative.slice(prefix.length + 1);
        const [name, ...deeper] = rest.split("/").filter(Boolean);
        if (!name || name.startsWith(".")) continue;
        const childPath = `${prefix}/${name}`;
        if (deeper.length > 0) children.set(name, { name, path: childPath, kind: "directory" });
        else if (!children.has(name)) children.set(name, { name, path: childPath, kind: "file" });
      }
      return [...children.values()];
    },
  };
}

export function createMergedGraphStore(project: GraphFileStore, account: GraphFileStore): GraphFileStore {
  return {
    async walkFiles() {
      const [projectFiles, accountFiles] = await Promise.all([
        project.walkFiles().catch(() => [] as WalkedFile[]),
        account.walkFiles().catch(() => [] as WalkedFile[]),
      ]);
      const seen = new Set<string>();
      const merged: WalkedFile[] = [];
      for (const entry of [...projectFiles, ...accountFiles]) {
        if (seen.has(entry.relativePath)) continue;
        seen.add(entry.relativePath);
        merged.push(entry);
      }
      return merged;
    },
    readFile: (path) => route(path, account, project).readFile(path),
    readBytes: async (path) => {
      const store = route(path, account, project);
      if (store.readBytes) return store.readBytes(path);
      return new TextEncoder().encode(await store.readFile(path));
    },
    writeFile: (path, content) => route(path, account, project).writeFile(path, content),
    createDirectory: (path) => route(path, account, project).createDirectory?.(path) ?? Promise.resolve(),
    delete: (path) => route(path, account, project).delete?.(path) ?? Promise.resolve(),
    listDirectory: (path) => {
      if (isAccountVirtualPath(path) || path === "account") {
        return account.listDirectory?.(path) ?? Promise.resolve([]);
      }
      return project.listDirectory?.(path) ?? Promise.resolve([]);
    },
  };
}

function route(path: string, account: GraphFileStore, project: GraphFileStore): GraphFileStore {
  return isAccountVirtualPath(path) ? account : project;
}
