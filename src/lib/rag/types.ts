export type RagSourceType = "code" | "document" | "conversation" | "memory";

export interface RagDocument {
  id: string;
  projectId: string;
  sourceType: RagSourceType;
  sourcePath?: string;
  chunkIndex?: number;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface RagResult {
  id: string;
  projectId: string;
  sourceType: RagSourceType | string;
  sourcePath?: string | null;
  chunkIndex?: number | null;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ChunkMetadata {
  projectId: string;
  path: string;
  language?: string | null;
  sourceType?: RagSourceType;
}

export interface CodeChunk {
  index: number;
  content: string;
  startLine: number;
  endLine: number;
}

export interface Chunker {
  chunk(content: string, metadata: ChunkMetadata): CodeChunk[];
}

export interface RagService {
  indexProject(projectId: string): Promise<void>;
  indexFile(projectId: string, filePath: string): Promise<void>;
  removeFile(projectId: string, filePath: string): Promise<void>;
  search(projectId: string, query: string, topK?: number): Promise<RagResult[]>;
}
