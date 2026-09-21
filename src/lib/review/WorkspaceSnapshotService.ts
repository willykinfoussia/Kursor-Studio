import { reviewHash } from "./hash";
import type { ReviewFiles } from "./types";

export interface SnapshotEntry {
  existed: boolean;
  content: string | null;
  hash: string;
}

export class WorkspaceSnapshotService {
  private readonly entries = new Map<string, SnapshotEntry>();

  constructor(private readonly files: ReviewFiles) {}

  reset() {
    this.entries.clear();
  }

  load(entries: Record<string, SnapshotEntry>) {
    this.entries.clear();
    for (const [path, entry] of Object.entries(entries)) this.entries.set(path, entry);
  }

  has(runId: string, path: string) {
    return this.entries.has(key(runId, path));
  }

  get(runId: string, path: string) {
    return this.entries.get(key(runId, path));
  }

  dump(runId: string) {
    const result: Record<string, SnapshotEntry> = {};
    const prefix = `${runId}:`;
    for (const [entryKey, entry] of this.entries) {
      if (entryKey.startsWith(prefix)) result[entryKey.slice(prefix.length)] = entry;
    }
    return result;
  }

  async capture(runId: string, path: string): Promise<SnapshotEntry> {
    const existing = this.get(runId, path);
    if (existing) return existing;
    const content = await this.files.read(path);
    const entry: SnapshotEntry = {
      existed: content !== null,
      content,
      hash: await reviewHash(content),
    };
    this.entries.set(key(runId, path), entry);
    return entry;
  }
}

function key(runId: string, path: string) {
  return `${runId}:${path}`;
}
