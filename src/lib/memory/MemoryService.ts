import { ragService } from "../rag/RagService";
import { memoryStore } from "./MemoryStore";
import { retrieveMemories } from "./MemoryRetriever";
import type { Memory, MemoryService } from "./types";

export class DefaultMemoryService implements MemoryService {
  async save(memory: Memory) {
    const now = Date.now();
    const record: Memory = {
      ...memory,
      createdAt: memory.createdAt || now,
      updatedAt: now,
    };
    await memoryStore.save(record);
    if (record.projectId) {
      await ragService.indexMemory(record).catch(() => undefined);
    }
  }

  get(id: string) {
    return memoryStore.get(id);
  }

  search(projectId: string, query: string) {
    return retrieveMemories(projectId, query);
  }

  async delete(id: string) {
    const existing = await memoryStore.get(id);
    await memoryStore.delete(id);
    if (existing?.projectId) {
      await ragService.removeFile(existing.projectId, `memory:${id}`).catch(() => undefined);
    }
  }
}

export const memoryService = new DefaultMemoryService();
