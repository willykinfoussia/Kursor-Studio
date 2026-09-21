import { describe, expect, it, vi } from "vitest";

vi.mock("../../storage/memoryRepository", () => ({
  memoryRepository: {
    search: vi.fn(async (projectId: string | null) => {
      const rows = [
        { id: "g1", projectId: null, scope: "global", memoryType: "preference", content: "User prefers TypeScript.", importance: 1, createdAt: 1, updatedAt: 1 },
        { id: "a1", projectId: "proj-a", scope: "project", memoryType: "architecture", content: "This project uses FastAPI.", importance: 1, createdAt: 1, updatedAt: 1 },
        { id: "b1", projectId: "proj-b", scope: "project", memoryType: "architecture", content: "This project uses Next.js.", importance: 1, createdAt: 1, updatedAt: 1 },
      ];
      return rows.filter((row) => row.scope === "global" || row.projectId === projectId);
    }),
    save: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

import { retrieveMemories } from "../MemoryRetriever";

describe("memory project isolation", () => {
  it("returns project A memory plus global, never project B", async () => {
    const items = await retrieveMemories("proj-a", "project", 8);
    expect(items.some((item) => item.content.includes("FastAPI"))).toBe(true);
    expect(items.some((item) => item.content.includes("TypeScript"))).toBe(true);
    expect(items.some((item) => item.content.includes("Next.js"))).toBe(false);
  });
});
