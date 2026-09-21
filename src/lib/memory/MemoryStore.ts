import { memoryRepository } from "../storage/memoryRepository";
import type { MemoryRecord } from "../storage/types";
import type { Memory } from "./types";

function toMemory(record: MemoryRecord): Memory {
  return {
    ...record,
    memoryType: record.memoryType as Memory["memoryType"],
  };
}

export const memoryStore = {
  async save(memory: Memory) {
    await memoryRepository.save(memory);
  },
  async get(id: string) {
    const record = await memoryRepository.get(id);
    return record ? toMemory(record) : null;
  },
  async search(projectId: string, query: string) {
    const records = await memoryRepository.search(projectId, query);
    return records.map(toMemory);
  },
  async delete(id: string) {
    await memoryRepository.delete(id);
  },
};
