import { normalizeRelativePath } from "../../filesystem/pathUtils";
import type { GraphFileStore, WalkedFile } from "../types";

export class MemoryGraphFs implements GraphFileStore {
  private readonly store = new Map<string, { text?: string; bytes?: Uint8Array; modifiedAt: number }>();

  setText(path: string, content: string, modifiedAt = Date.now()) {
    this.store.set(normalizeRelativePath(path), { text: content, modifiedAt });
  }

  setBytes(path: string, bytes: Uint8Array, modifiedAt = Date.now()) {
    this.store.set(normalizeRelativePath(path), { bytes, modifiedAt });
  }

  async walkFiles(): Promise<WalkedFile[]> {
    return [...this.store.entries()]
      .filter(([path]) => !path.endsWith("/"))
      .map(([relativePath, value]) => ({
        relativePath,
        size: value.bytes?.byteLength ?? new TextEncoder().encode(value.text ?? "").length,
        modifiedAt: value.modifiedAt,
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  async readFile(path: string): Promise<string> {
    const item = this.store.get(normalizeRelativePath(path));
    if (!item) throw new Error(`missing ${path}`);
    if (item.bytes && item.text === undefined) throw new Error("Binary file");
    if (item.text === undefined) throw new Error(`missing ${path}`);
    return item.text;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const item = this.store.get(normalizeRelativePath(path));
    if (!item) throw new Error(`missing ${path}`);
    if (item.bytes) return item.bytes;
    return new TextEncoder().encode(item.text ?? "");
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.store.set(normalizeRelativePath(path), { text: content, modifiedAt: Date.now() });
  }

  async createDirectory(path: string): Promise<void> {
    const normalized = normalizeRelativePath(path).replace(/\/+$/, "");
    if (!this.store.has(`${normalized}/`)) this.store.set(`${normalized}/`, { text: "", modifiedAt: Date.now() });
  }

  async delete(path: string): Promise<void> {
    const normalized = normalizeRelativePath(path).replace(/\/+$/, "");
    for (const key of [...this.store.keys()]) {
      if (key === normalized || key === `${normalized}/` || key.startsWith(`${normalized}/`)) this.store.delete(key);
    }
  }

  async listDirectory(path: string): Promise<{ name: string; path: string; kind: "file" | "directory" }[]> {
    const prefix = normalizeRelativePath(path).replace(/\/+$/, "");
    const children = new Map<string, { name: string; path: string; kind: "file" | "directory" }>();
    for (const key of this.store.keys()) {
      const isDirectory = key.endsWith("/");
      const normalized = key.replace(/\/+$/, "");
      if (prefix) {
        if (normalized === prefix) continue;
        if (!normalized.startsWith(`${prefix}/`)) continue;
      } else if (!normalized) continue;
      const rest = prefix ? normalized.slice(prefix.length + 1) : normalized;
      const [name, ...deeper] = rest.split("/").filter(Boolean);
      if (!name) continue;
      const childPath = prefix ? `${prefix}/${name}` : name;
      if (deeper.length > 0 || (isDirectory && rest === name)) {
        children.set(name, { name, path: childPath, kind: "directory" });
      } else if (!children.has(name)) {
        children.set(name, { name, path: childPath, kind: "file" });
      }
    }
    return [...children.values()];
  }

  has(path: string): boolean {
    return this.store.has(normalizeRelativePath(path));
  }
}
