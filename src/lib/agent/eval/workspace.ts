import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BINARY_EXTENSIONS, DEFAULT_EXCLUDED_DIRECTORIES, type FileEntry } from "../../filesystem/fileTypes";
import {
  extensionOf,
  fileName,
  normalizeRelativePath,
  resolveProjectPath,
} from "../../filesystem/pathUtils";
import type { FileSystemService } from "../../filesystem/FileSystemService";
import type { ContextFileStore } from "../context/types";
import type { RecoveryFiles } from "../recovery/types";

const SKIP = new Set<string>(DEFAULT_EXCLUDED_DIRECTORIES);

export interface EvalWorkspace {
  root: string;
  initial: Record<string, string>;
  fs: FileSystemService;
  asContextFiles(): ContextFileStore;
  asRecoveryFiles(): RecoveryFiles;
  read(relativePath: string): Promise<string>;
  snapshot(): Promise<Record<string, string>>;
  dispose(): Promise<void>;
}

export async function createEvalWorkspace(fixture: Record<string, string>): Promise<EvalWorkspace> {
  const root = (await mkdtemp(join(tmpdir(), "kursor-eval-"))).replace(/\\/g, "/");
  for (const [relative, content] of Object.entries(fixture)) {
    const abs = resolveProjectPath(root, relative);
    const parent = dirname(abs);
    await mkdir(parent, { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  const fs = createNodeFileSystemService(root);
  const initial = await collectFiles(root);
  return {
    root,
    initial,
    fs,
    asContextFiles() {
      return {
        readFile: (path) => fs.readFile(path),
        listDirectory: async (path) => {
          const entries = await fs.listDirectory(path);
          return entries.map((entry) => ({
            name: entry.name,
            path: entry.relativePath || entry.path,
            kind: entry.kind,
          }));
        },
      };
    },
    asRecoveryFiles() {
      return {
        readFile: (path) => fs.readFile(path),
        writeFile: (path, content) => fs.writeFile(path, content),
        delete: (path) => fs.delete(path),
      };
    },
    read(relativePath) {
      return fs.readFile(relativePath);
    },
    snapshot() {
      return collectFiles(root);
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function createNodeFileSystemService(root: string): FileSystemService {
  const resolve = (relativePath: string) => resolveProjectPath(root, relativePath || ".");

  return {
    async listDirectory(path) {
      const relative = normalizeRelativePath(path || "");
      const abs = relative && relative !== "." ? resolve(relative) : root;
      const names = await readdir(abs);
      const entries: FileEntry[] = [];
      for (const name of names) {
        if (SKIP.has(name)) continue;
        const childAbs = join(abs, name).replace(/\\/g, "/");
        const childRel = relative && relative !== "." ? `${relative}/${name}` : name;
        const info = await stat(childAbs);
        entries.push({
          name,
          path: childAbs,
          relativePath: childRel.replace(/\\/g, "/"),
          kind: info.isDirectory() ? "directory" : "file",
          extension: info.isDirectory() ? undefined : extensionOf(name),
        });
      }
      return entries;
    },
    async readFile(path) {
      return readFile(resolve(path), "utf8");
    },
    async writeFile(path, content) {
      const abs = resolve(path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
    },
    async createFile(path) {
      const abs = resolve(path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, "", "utf8");
    },
    async createDirectory(path) {
      await mkdir(resolve(path), { recursive: true });
    },
    async rename(path, newPath) {
      const from = resolve(path);
      const to = resolve(newPath);
      await mkdir(dirname(to), { recursive: true });
      const content = await readFile(from);
      await writeFile(to, content);
      await unlink(from);
    },
    async delete(path) {
      await rm(resolve(path), { recursive: true, force: true });
    },
    async watch() {
      return () => undefined;
    },
    searchFiles(query, known) {
      const needle = query.trim().toLowerCase();
      if (!needle) return known.filter((entry) => entry.kind === "file");
      return known.filter((entry) => {
        if (entry.kind !== "file") return false;
        return entry.name.toLowerCase().includes(needle)
          || entry.relativePath.toLowerCase().includes(needle);
      });
    },
    async searchProjectFiles(query) {
      const all = await walkFiles(root, "");
      return this.searchFiles(query, all);
    },
    isBinaryPath(path) {
      const extension = extensionOf(path);
      return Boolean(extension && BINARY_EXTENSIONS.has(extension));
    },
  };
}

async function collectFiles(root: string, relative = ""): Promise<Record<string, string>> {
  const entries = await walkFiles(root, relative);
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    files[entry.relativePath] = await readFile(entry.path, "utf8");
  }
  return files;
}

async function walkFiles(root: string, relative: string): Promise<FileEntry[]> {
  const abs = relative ? resolveProjectPath(root, relative) : root;
  const names = await readdir(abs).catch(() => [] as string[]);
  const out: FileEntry[] = [];
  for (const name of names) {
    if (SKIP.has(name)) continue;
    const childRel = relative ? `${relative}/${name}` : name;
    const childAbs = join(abs, name).replace(/\\/g, "/");
    const info = await stat(childAbs);
    if (info.isDirectory()) {
      out.push(...await walkFiles(root, childRel));
    } else {
      out.push({
        name: fileName(childRel),
        path: childAbs,
        relativePath: childRel.replace(/\\/g, "/"),
        kind: "file",
        extension: extensionOf(childRel),
      });
    }
  }
  return out;
}

