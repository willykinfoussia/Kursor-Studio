import type { Chunker, ChunkMetadata, CodeChunk } from "./types";

const TARGET_LINES = 100;
const OVERLAP_LINES = 15;

export class LineBlockChunker implements Chunker {
  chunk(content: string, _metadata: ChunkMetadata): CodeChunk[] {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return [];
    const chunks: CodeChunk[] = [];
    let start = 0;
    let index = 0;
    while (start < lines.length) {
      const end = Math.min(lines.length, start + TARGET_LINES);
      const slice = lines.slice(start, end).join("\n").trim();
      if (slice) {
        chunks.push({
          index,
          content: slice,
          startLine: start + 1,
          endLine: end,
        });
        index += 1;
      }
      if (end >= lines.length) break;
      start = Math.max(end - OVERLAP_LINES, start + 1);
    }
    return chunks;
  }
}

export const defaultChunker = new LineBlockChunker();
