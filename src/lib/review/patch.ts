import { joinLines, splitLines } from "./diff";
import type { AiChangeHunk, PatchApplyResult } from "./types";

function hunkBodies(hunk: Pick<AiChangeHunk, "originalText" | "proposedText">) {
  return {
    original: hunk.originalText,
    proposed: hunk.proposedText,
  };
}

function indexOfLines(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return 0;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let match = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        match = false;
        break;
      }
    }
    if (match) return index;
  }
  return -1;
}

function replaceRange(lines: string[], start: number, count: number, next: string[]): string[] {
  return [...lines.slice(0, start), ...next, ...lines.slice(start + count)];
}

export function canApplyHunk(content: string, hunk: Pick<AiChangeHunk, "originalText" | "oldStart">): boolean {
  return applyHunk(content, hunk, hunk.originalText, "").ok;
}

export function applyHunk(
  content: string,
  hunk: Pick<AiChangeHunk, "originalText" | "oldStart">,
  searchText: string,
  replaceText: string,
): PatchApplyResult {
  const file = splitLines(content);
  const search = splitLines(searchText).lines;
  const replace = splitLines(replaceText).lines;
  if (search.length === 0 && replace.length === 0) return { ok: true, content };
  let index = -1;
  if (search.length === 0) {
    const hint = Math.max(0, hunk.oldStart - 1);
    index = Math.min(hint, file.lines.length);
  } else {
    const hint = Math.max(0, hunk.oldStart - 1);
    if (hint <= file.lines.length - search.length) {
      let match = true;
      for (let offset = 0; offset < search.length; offset += 1) {
        if (file.lines[hint + offset] !== search[offset]) {
          match = false;
          break;
        }
      }
      if (match) index = hint;
    }
    if (index < 0) index = indexOfLines(file.lines, search);
  }
  if (index < 0) return { ok: false, reason: "Hunk context no longer matches the file." };
  const next = replaceRange(file.lines, index, search.length, replace);
  return {
    ok: true,
    content: joinLines({ lines: next, eol: file.eol, trailingNewline: file.trailingNewline || content.endsWith("\n") }),
  };
}

export function applyForward(content: string, hunk: AiChangeHunk): PatchApplyResult {
  const { original, proposed } = hunkBodies(hunk);
  return applyHunk(content, hunk, original, proposed);
}

export function applyReverse(content: string, hunk: AiChangeHunk): PatchApplyResult {
  const { original, proposed } = hunkBodies(hunk);
  return applyHunk(content, hunk, proposed, original);
}

export function applyHunks(
  content: string,
  hunks: AiChangeHunk[],
  direction: "forward" | "reverse",
): PatchApplyResult {
  let current = content;
  const ordered = direction === "reverse" ? [...hunks].reverse() : hunks;
  for (const hunk of ordered) {
    const result = direction === "forward" ? applyForward(current, hunk) : applyReverse(current, hunk);
    if (!result.ok) return result;
    current = result.content;
  }
  return { ok: true, content: current };
}
