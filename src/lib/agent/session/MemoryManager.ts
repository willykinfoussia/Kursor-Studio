import { retrieveMemories } from "../../memory/MemoryRetriever";
import { memoryService } from "../../memory/MemoryService";
import type { Memory } from "../../memory/types";
import { indexConversation } from "../../rag/Indexer";
import { ragService } from "../../rag/RagService";
import type { RagResult, RagSourceType } from "../../rag/types";
import type { CompactResult } from "./types";

export interface SemanticIndexInput {
  projectId: string;
  sourceType: RagSourceType;
  sourcePath: string;
  content: string;
}

export interface MemoryManagerDeps {
  saveStructured: (memory: Memory) => Promise<void>;
  searchStructured: (projectId: string, query: string, limit?: number) => Promise<Memory[]>;
  indexSemantic: (input: SemanticIndexInput) => Promise<void>;
  searchSemantic: (projectId: string, query: string, topK?: number) => Promise<RagResult[]>;
}

export class MemoryManager {
  constructor(private readonly deps: MemoryManagerDeps) {}

  saveStructured(memory: Omit<Memory, "createdAt" | "updatedAt"> & Partial<Pick<Memory, "createdAt" | "updatedAt">>) {
    const now = Date.now();
    return this.deps.saveStructured({
      ...memory,
      createdAt: memory.createdAt ?? now,
      updatedAt: now,
    });
  }

  searchStructured(projectId: string, query: string, limit = 8) {
    return this.deps.searchStructured(projectId, query, limit);
  }

  indexSemantic(input: SemanticIndexInput) {
    return this.deps.indexSemantic(input);
  }

  searchSemantic(projectId: string, query: string, topK = 8) {
    return this.deps.searchSemantic(projectId, query, topK);
  }

  async persistCompact(projectId: string | null, conversationId: string, result: CompactResult) {
    const now = Date.now();
    await this.saveStructured({
      id: crypto.randomUUID(),
      projectId,
      memoryType: "summary",
      memoryKey: `session-summary:${conversationId}`,
      content: result.summary,
      importance: 0.7,
      createdAt: now,
      updatedAt: now,
    });
    for (const decision of result.decisions) {
      await this.saveStructured({
        id: crypto.randomUUID(),
        projectId,
        memoryType: "decision",
        memoryKey: `session-decision:${conversationId}`,
        content: decision,
        importance: 0.8,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (result.currentState) {
      await this.saveStructured({
        id: crypto.randomUUID(),
        projectId,
        memoryType: "task_state",
        memoryKey: `session-task:${conversationId}`,
        content: result.currentState,
        importance: 0.6,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (projectId) {
      await this.indexSemantic({
        projectId,
        sourceType: "conversation",
        sourcePath: `conversation:${conversationId}`,
        content: [result.summary, result.currentState, ...result.decisions].filter(Boolean).join("\n"),
      });
    }
  }
}

export function createDefaultMemoryManager() {
  return new MemoryManager({
    saveStructured: (memory) => memoryService.save(memory),
    searchStructured: (projectId, query, limit) => retrieveMemories(projectId, query, limit),
    indexSemantic: async (input) => {
      if (input.sourceType === "conversation") {
        await indexConversation(input.projectId, input.sourcePath, input.content);
        return;
      }
      await ragService.indexMemory({
        id: input.sourcePath,
        projectId: input.projectId,
        memoryType: "summary",
        content: input.content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
    searchSemantic: (projectId, query, topK) => ragService.search(projectId, query, topK),
  });
}
