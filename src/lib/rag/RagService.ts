import { ragApi } from "../tauri/ragApi";
import { EmbeddingUnavailableError, embeddingService } from "./EmbeddingService";
import { indexFile, indexMemory, indexProject, removeFile } from "./Indexer";
import { mergeResults } from "./Retriever";
import type { RagResult, RagService } from "./types";
import type { Memory } from "../memory/types";

export class DefaultRagService implements RagService {
  indexProject(projectId: string) {
    return indexProject(projectId);
  }

  indexFile(projectId: string, filePath: string) {
    return indexFile(projectId, filePath);
  }

  removeFile(projectId: string, filePath: string) {
    return removeFile(projectId, filePath);
  }

  async search(projectId: string, query: string, topK = 8): Promise<RagResult[]> {
    let embedding: number[] = [];
    try {
      const [vector] = await embeddingService.embed([query]);
      embedding = vector ?? [];
    } catch (error) {
      if (!(error instanceof EmbeddingUnavailableError)) throw error;
    }
    const hits = await ragApi.search({
      projectId,
      embedding: embedding.length > 0 ? embedding : undefined,
      query,
      topK,
    });
    return mergeResults(hits, [], query, topK);
  }

  indexMemory(memory: Memory) {
    return indexMemory(memory);
  }
}

export const ragService = new DefaultRagService();
