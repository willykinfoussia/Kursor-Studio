import { sha256Hex } from "../graph/hash";
import { ABSENT_HASH } from "./types";

export { ABSENT_HASH };

export async function reviewHash(content: string | null | undefined): Promise<string> {
  if (content === null || content === undefined) return ABSENT_HASH;
  return sha256Hex(content);
}

export function utf8Bytes(content: string) {
  return new TextEncoder().encode(content).byteLength;
}
