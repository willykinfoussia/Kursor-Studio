import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "../types";

const { memoryUpsert, memoryGet, memorySearch, memoryDelete } = vi.hoisted(() => ({
  memoryUpsert: vi.fn(async () => undefined),
  memoryGet: vi.fn(async (): Promise<Memory | null> => null),
  memorySearch: vi.fn(async (): Promise<Memory[]> => []),
  memoryDelete: vi.fn(async () => undefined),
}));

vi.mock("../../storage/memoryRepository", () => ({
  memoryRepository: {
    save: memoryUpsert,
    get: memoryGet,
    search: memorySearch,
    delete: memoryDelete,
  },
}));

vi.mock("../../rag/RagService", () => ({
  ragService: {
    indexMemory: vi.fn(async () => undefined),
    removeFile: vi.fn(async () => undefined),
  },
}));

import { memoryService } from "../MemoryService";

const sample: Memory = {
  id: "mem-1",
  projectId: "todo",
  memoryType: "architecture",
  content: "The frontend uses React + TypeScript + Vite.",
  createdAt: 1,
  updatedAt: 1,
};

describe("memory service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves, searches and deletes memory", async () => {
    await memoryService.save(sample);
    expect(memoryUpsert).toHaveBeenCalled();
    memorySearch.mockResolvedValueOnce([sample]);
    await expect(memoryService.search("todo", "React")).resolves.toHaveLength(1);
    memoryGet.mockResolvedValueOnce(sample);
    await memoryService.delete("mem-1");
    expect(memoryDelete).toHaveBeenCalledWith("mem-1");
  });
});
