import { fileSystemService } from "../filesystem/FileSystemService";
import { languageFromPath } from "../filesystem/languageFromPath";
import { useProjectStore } from "../../stores/projectStore";
import { useRagStore } from "../../stores/ragStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ragApi } from "../tauri/ragApi";
import { defaultChunker } from "./Chunker";
import { EmbeddingUnavailableError, embeddingService } from "./EmbeddingService";
import type { CodeChunk } from "./types";
import type { Memory } from "../memory/types";
import type { RagChunkInput } from "../storage/types";

const BATCH = 8;

function ignorePatterns() {
  return useSettingsStore.getState().ragIgnorePatterns ?? [];
}

function chunkId(projectId: string, path: string, index: number) {
  return `${projectId}:${path}:${index}`;
}

function toChunks(content: string, projectId: string, path: string): CodeChunk[] {
  return defaultChunker.chunk(content, { projectId, path, language: languageFromPath(path), sourceType: "code" });
}

async function embedOrEmpty(texts: string[]): Promise<number[][]> {
  try {
    return await embeddingService.embed(texts);
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError) return texts.map(() => []);
    throw error;
  }
}

async function upsertFileChunks(projectId: string, path: string, content: string, hash: string, size: number) {
  const chunks = toChunks(content, projectId, path);
  const embeddings = await embedOrEmpty(chunks.map((chunk) => chunk.content));
  const payload: RagChunkInput[] = chunks.map((chunk, index) => ({
    id: chunkId(projectId, path, chunk.index),
    projectId,
    sourceType: "code",
    sourcePath: path,
    chunkIndex: chunk.index,
    content: chunk.content,
    embedding: embeddings[index] ?? [],
    metadata: {
      projectId,
      sourceType: "code",
      filePath: path,
      language: languageFromPath(path),
      chunkIndex: chunk.index,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      indexedAt: Date.now(),
    },
  }));
  if (payload.length > 0) await ragApi.upsertChunks(payload);
  await ragApi.markFileIndexed({
    id: `${projectId}:${path}`,
    projectId,
    path,
    language: languageFromPath(path),
    fileType: "code",
    fileSize: size,
    contentHash: hash,
    indexedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function indexProject(projectId: string) {
  const project = useProjectStore.getState().currentProject;
  if (!project || project.id !== projectId) return;
  const plan = await ragApi.planIndex(projectId, project.rootPath, ignorePatterns());
  const total = plan.toIndex.length + plan.toDelete.length;
  useRagStore.getState().setProgress({
    indexing: total > 0,
    projectId,
    done: 0,
    total,
    path: null,
    status: total === 0 ? "idle" : "indexing",
  });
  let done = 0;
  for (const path of plan.toDelete) {
    await ragApi.removeFile(projectId, path);
    done += 1;
    useRagStore.getState().setProgress({ done, path, status: "indexing" });
  }
  for (let index = 0; index < plan.toIndex.length; index += BATCH) {
    const batch = plan.toIndex.slice(index, index + BATCH);
    for (const file of batch) {
      try {
        const content = await fileSystemService.readFile(file.path);
        await upsertFileChunks(projectId, file.path, content, file.hash, file.size);
      } catch {
        // Skip unreadable files (binary / missing) without blocking the rest.
      }
      done += 1;
      useRagStore.getState().setProgress({ done, path: file.path, status: "indexing" });
    }
  }
  useRagStore.getState().setProgress({ indexing: false, status: "idle", path: null, done: total, total });
}

export async function indexFile(projectId: string, filePath: string) {
  const project = useProjectStore.getState().currentProject;
  if (!project || project.id !== projectId) return;
  const plan = await ragApi.planIndex(projectId, project.rootPath, ignorePatterns());
  const file = plan.toIndex.find((item) => item.path === filePath);
  if (!file) return;
  const content = await fileSystemService.readFile(file.path);
  await upsertFileChunks(projectId, file.path, content, file.hash, file.size);
}

export async function removeFile(projectId: string, filePath: string) {
  await ragApi.removeFile(projectId, filePath);
}

export async function indexMemory(memory: Memory) {
  if (!memory.projectId) return;
  const [embedding] = await embedOrEmpty([memory.content]);
  await ragApi.upsertChunks([{
    id: `memory:${memory.id}`,
    projectId: memory.projectId,
    sourceType: "memory",
    sourcePath: `memory:${memory.id}`,
    chunkIndex: 0,
    content: memory.content,
    embedding: embedding ?? [],
    metadata: {
      projectId: memory.projectId,
      sourceType: "memory",
      memoryType: memory.memoryType,
    },
  }]);
}

export async function indexConversation(projectId: string, sourcePath: string, content: string) {
  if (!projectId || !content.trim()) return;
  const chunks = defaultChunker.chunk(content, {
    projectId,
    path: sourcePath,
    sourceType: "conversation",
  });
  const payload = chunks.length > 0 ? chunks : [{ index: 0, content, startLine: 1, endLine: 1 }];
  const embeddings = await embedOrEmpty(payload.map((chunk) => chunk.content));
  await ragApi.upsertChunks(payload.map((chunk, index) => ({
    id: `${projectId}:${sourcePath}:${chunk.index}`,
    projectId,
    sourceType: "conversation",
    sourcePath,
    chunkIndex: chunk.index,
    content: chunk.content,
    embedding: embeddings[index] ?? [],
    metadata: {
      projectId,
      sourceType: "conversation",
      filePath: sourcePath,
      chunkIndex: chunk.index,
      indexedAt: Date.now(),
    },
  })));
}

export const indexer = { indexProject, indexFile, removeFile, indexMemory, indexConversation };
