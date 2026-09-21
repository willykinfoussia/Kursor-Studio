import { memoryStore } from "./MemoryStore";
import { summarizeMemory } from "./MemorySummarizer";
import type { Memory } from "./types";

export async function retrieveMemories(projectId: string, query: string, limit = 8): Promise<Memory[]> {
  const items = await memoryStore.search(projectId, query);
  return items
    .slice(0, limit)
    .map((memory) => ({ ...memory, content: summarizeMemory(memory) }));
}

export const memoryRetriever = { retrieve: retrieveMemories };
