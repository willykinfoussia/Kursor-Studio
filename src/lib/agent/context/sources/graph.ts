import { CONTEXT_PRIORITIES, type ContextRetrievers, type ContextSource, type SourceCollectResult } from "../types";
import { clipText, estimateTokens, mentionedPaths } from "../tokens";

const MAX_GRAPH_FILE_CHARS = 1_400;

export class GraphSource implements ContextSource {
  readonly id = "graph" as const;

  constructor(private readonly retrievers: ContextRetrievers = {}) {}

  async collect(
    snapshot: Parameters<ContextSource["collect"]>[0],
    budget: Parameters<ContextSource["collect"]>[1],
  ): Promise<SourceCollectResult> {
    if (!snapshot.project) return { slices: [], skipReason: "no project" };
    if (!this.retrievers.graph) return { slices: [], skipReason: "graph retriever unavailable" };

    const paths = [
      ...mentionedPaths(snapshot.request),
      ...snapshot.openFiles.map((file) => file.path),
      ...(snapshot.currentFile?.path ? [snapshot.currentFile.path] : []),
    ];

    try {
      const results = await this.retrievers.graph(
        snapshot.project.id,
        { query: snapshot.request, paths },
        budget.maxGraphFiles,
      );
      const currentPath = snapshot.currentFile?.path ?? "";
      const slices = results
        .filter((result) => result.path && result.path !== currentPath)
        .map((result, index) => {
          const content = clipText(result.content, MAX_GRAPH_FILE_CHARS);
          const text = `${result.path}:\n${content}`;
          return {
            id: `graph:${index}:${result.path}`,
            source: this.id,
            priority: CONTEXT_PRIORITIES.graph,
            score: result.score,
            tokens: estimateTokens(text),
            text,
            meta: { path: result.path },
          };
        });
      if (slices.length === 0) return { slices: [], skipReason: "no related graph files" };
      return { slices };
    } catch {
      return { slices: [], skipReason: "graph lookup failed" };
    }
  }
}
