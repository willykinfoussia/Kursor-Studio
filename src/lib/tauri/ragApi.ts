import { invokeCommand } from "./invoke";
import type { IndexPlan, ProjectFileRecord, RagChunkInput, RagSearchHit } from "../storage/types";

export const ragApi = {
  planIndex: (projectId: string, rootPath: string, ignorePatterns: string[] = []) =>
    invokeCommand<IndexPlan>("rag_plan_index", { projectId, rootPath, ignorePatterns }, {
      projectId,
      toIndex: [],
      toDelete: [],
    }),
  upsertChunks: (chunks: RagChunkInput[]) => invokeCommand<void>("rag_upsert_chunks", { chunks }),
  markFileIndexed: (file: ProjectFileRecord) => invokeCommand<void>("rag_mark_file_indexed", { file }),
  removeFile: (projectId: string, path: string) => invokeCommand<void>("rag_remove_file", { projectId, path }),
  search: (input: {
    projectId: string;
    embedding?: number[];
    query?: string;
    topK?: number;
    sourceType?: string;
  }) => invokeCommand<RagSearchHit[]>("rag_search", input, []),
};
