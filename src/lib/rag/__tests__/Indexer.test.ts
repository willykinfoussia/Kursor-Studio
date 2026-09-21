import { beforeEach, describe, expect, it, vi } from "vitest";

const { planIndex, upsertChunks, markFileIndexed, removeFile, search } = vi.hoisted(() => ({
  planIndex: vi.fn(),
  upsertChunks: vi.fn(async () => undefined),
  markFileIndexed: vi.fn(async () => undefined),
  removeFile: vi.fn(async () => undefined),
  search: vi.fn(async () => []),
}));

vi.mock("../../tauri/ragApi", () => ({
  ragApi: {
    planIndex,
    upsertChunks,
    markFileIndexed,
    removeFile,
    search,
  },
}));

vi.mock("../../filesystem/FileSystemService", () => ({
  fileSystemService: {
    readFile: vi.fn(async () => "export function todos() { return []; }"),
  },
  setProjectRootGetter: vi.fn(),
}));

vi.mock("../EmbeddingService", () => ({
  EmbeddingUnavailableError: class extends Error {},
  embeddingService: { embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])) },
}));

import { useProjectStore } from "../../../stores/projectStore";
import { indexFile, indexProject, removeFile as removeIndexedFile } from "../Indexer";

describe("indexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      currentProject: { id: "p1", accountId: "local-account", name: "Todo", rootPath: "/tmp/todo", localPath: "/tmp/todo" },
    } as never);
  });

  it("skips unchanged files", async () => {
    planIndex.mockResolvedValueOnce({ projectId: "p1", toIndex: [], toDelete: [] });
    await indexProject("p1");
    expect(upsertChunks).not.toHaveBeenCalled();
    expect(removeFile).not.toHaveBeenCalled();
  });

  it("reindexes changed files", async () => {
    planIndex.mockResolvedValueOnce({
      projectId: "p1",
      toIndex: [{ path: "src/App.tsx", hash: "abc", size: 12, language: "tsx" }],
      toDelete: [],
    });
    await indexFile("p1", "src/App.tsx");
    expect(upsertChunks).toHaveBeenCalled();
    expect(markFileIndexed).toHaveBeenCalled();
  });

  it("removes vectors for deleted files", async () => {
    await removeIndexedFile("p1", "src/gone.ts");
    expect(removeFile).toHaveBeenCalledWith("p1", "src/gone.ts");
  });
});
