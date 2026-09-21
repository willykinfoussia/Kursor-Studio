import { CONTEXT_PRIORITIES, type ContextRetrievers, type ContextSource, type SourceCollectResult } from "../types";
import { clipText, estimateTokens, mentionedPaths, pathOverlap } from "../tokens";
import { MAX_RAG_CHUNK_CHARS } from "../budget";

export class RagSource implements ContextSource {
  readonly id = "rag" as const;

  constructor(private readonly retrievers: ContextRetrievers = {}) {}

  async collect(
    snapshot: Parameters<ContextSource["collect"]>[0],
    budget: Parameters<ContextSource["collect"]>[1],
  ): Promise<SourceCollectResult> {
    if (!snapshot.project) return { slices: [], skipReason: "no project" };
    if (!snapshot.request.trim()) return { slices: [], skipReason: "empty query" };
    if (!this.retrievers.rag) return { slices: [], skipReason: "rag retriever unavailable" };

    try {
      const results = await this.retrievers.rag(
        snapshot.project.id,
        snapshot.request,
        budget.maxRagChunks,
      );
      const currentPath = snapshot.currentFile?.path ?? "";
      const relevant = mentionedPaths(snapshot.request).concat(
        snapshot.openFiles.map((file) => file.path),
        currentPath ? [currentPath] : [],
      );
      const slices = results
        .filter((result) => {
          const path = result.sourcePath ?? "";
          return !path || !currentPath || !pathOverlap(path, [currentPath]);
        })
        .map((result, index) => {
          const content = clipText(result.content, MAX_RAG_CHUNK_CHARS);
          const path = result.sourcePath ? `${result.sourcePath}:\n` : "";
          const text = `${path}${content}`;
          const relevantCode = result.sourcePath
            ? pathOverlap(result.sourcePath, relevant)
            : false;
          return {
            id: `rag:${index}:${result.id}`,
            source: this.id,
            priority: relevantCode ? CONTEXT_PRIORITIES.relevantCode : CONTEXT_PRIORITIES.rag,
            score: result.score,
            tokens: estimateTokens(text),
            text,
            meta: {
              ragId: result.id,
              path: result.sourcePath ?? "",
              relevant: relevantCode ? "1" : "0",
            },
          };
        });
      if (slices.length === 0) return { slices: [], skipReason: "no matching rag chunks" };
      return { slices };
    } catch {
      return { slices: [], skipReason: "rag lookup failed" };
    }
  }
}
