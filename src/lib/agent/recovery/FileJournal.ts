import type { JournalEntry, RecoveryFiles } from "./types";

export class FileJournal {
  private readonly entries = new Map<string, JournalEntry>();

  has(path: string) {
    return this.entries.has(path);
  }

  get(path: string) {
    return this.entries.get(path);
  }

  snapshot(): Record<string, JournalEntry> {
    return Object.fromEntries(this.entries.entries());
  }

  load(journal: Record<string, JournalEntry>) {
    this.entries.clear();
    for (const [path, entry] of Object.entries(journal)) {
      this.entries.set(path, { existed: entry.existed, content: entry.content });
    }
  }

  reset() {
    this.entries.clear();
  }

  remember(path: string, entry: JournalEntry) {
    if (this.entries.has(path)) return this.entries.get(path)!;
    this.entries.set(path, entry);
    return entry;
  }

  async capture(path: string, files: RecoveryFiles): Promise<JournalEntry> {
    const existing = this.entries.get(path);
    if (existing) return existing;
    try {
      const content = await files.readFile(path);
      const entry: JournalEntry = { existed: true, content };
      this.entries.set(path, entry);
      return entry;
    } catch {
      const entry: JournalEntry = { existed: false, content: null };
      this.entries.set(path, entry);
      return entry;
    }
  }
}
