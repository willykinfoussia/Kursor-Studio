export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "architecture"
  | "instruction"
  | "summary"
  | "task_state";

export interface Memory {
  id: string;
  agentId?: string | null;
  projectId?: string | null;
  scope?: "global" | "project" | string | null;
  memoryType: MemoryType;
  memoryKey?: string | null;
  content: string;
  importance?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryService {
  save(memory: Memory): Promise<void>;
  get(id: string): Promise<Memory | null>;
  search(projectId: string, query: string): Promise<Memory[]>;
  delete(id: string): Promise<void>;
}
