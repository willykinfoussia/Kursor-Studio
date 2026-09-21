import type { AiChangeHunk } from "./types";

export interface LineSet {
  lines: string[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
}

export type DiffOp = { type: "eq" | "del" | "ins"; line: string };

export interface ComputedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  originalText: string;
  proposedText: string;
  patch: string;
  reversePatch: string;
  additions: number;
  deletions: number;
}

const CONTEXT = 3;

export function splitLines(text: string): LineSet {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text === "") return { lines: [], eol, trailingNewline: false };
  const trailingNewline = text.endsWith("\n");
  const normalized = text.replace(/\r\n/g, "\n");
  const body = trailingNewline ? normalized.slice(0, -1) : normalized;
  return { lines: body.split("\n"), eol, trailingNewline };
}

export function joinLines(set: Pick<LineSet, "lines" | "eol" | "trailingNewline">): string {
  if (set.lines.length === 0) return set.trailingNewline ? (set.eol === "\r\n" ? "\r\n" : "\n") : "";
  return set.lines.join(set.eol) + (set.trailingNewline ? set.eol : "");
}

export function diffLines(a: string[], b: string[]): DiffOp[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length * b.length <= 4_000_000) return lcsDiff(a, b);
  return myersDiff(a, b);
}

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", line: a[i]! });
      i += 1;
    } else {
      ops.push({ type: "ins", line: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: a[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "ins", line: b[j]! });
    j += 1;
  }
  return ops;
}

function myersDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Map<number, number>[] = [];
  for (let d = 0; d <= max; d += 1) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(a, b, trace, d, n, m);
    }
  }
  return lcsDiff(a, b);
}

function backtrack(a: string[], b: string[], trace: Map<number, number>[], dMax: number, n: number, m: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = dMax; d >= 0; d -= 1) {
    const v = trace[d] ?? new Map<number, number>();
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) prevK = k + 1;
    else prevK = k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: "eq", line: a[x - 1]! });
      x -= 1;
      y -= 1;
    }
    if (d === 0) break;
    if (x === prevX) {
      if (y > 0) ops.push({ type: "ins", line: b[y - 1]! });
      y = prevY;
    } else {
      if (x > 0) ops.push({ type: "del", line: a[x - 1]! });
      x = prevX;
    }
  }
  return ops.reverse();
}

export function countEdits(ops: DiffOp[]) {
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.type === "ins") additions += 1;
    if (op.type === "del") deletions += 1;
  }
  return { additions, deletions };
}

export function hunksFromOps(path: string, oldLines: string[], newLines: string[], ops: DiffOp[], eol = "\n"): ComputedHunk[] {
  const ranges: { start: number; end: number }[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]?.type === "eq") {
      i += 1;
      continue;
    }
    const start = i;
    while (i < ops.length && ops[i]?.type !== "eq") i += 1;
    ranges.push({ start, end: i });
  }
  const expanded: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const start = Math.max(0, range.start - CONTEXT);
    const end = Math.min(ops.length, range.end + CONTEXT);
    const last = expanded[expanded.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else expanded.push({ start, end });
  }
  return expanded.map((range) => hunkFromRange(path, oldLines, newLines, ops, range.start, range.end, eol));
}

function hunkFromRange(
  path: string,
  oldLines: string[],
  newLines: string[],
  ops: DiffOp[],
  start: number,
  end: number,
  eol: string,
): ComputedHunk {
  let oldPos = 0;
  let newPos = 0;
  for (let index = 0; index < start; index += 1) {
    const op = ops[index];
    if (op?.type === "eq" || op?.type === "del") oldPos += 1;
    if (op?.type === "eq" || op?.type === "ins") newPos += 1;
  }
  const oldBody: string[] = [];
  const newBody: string[] = [];
  const patchLines: string[] = [];
  const reverseLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let additions = 0;
  let deletions = 0;
  for (let index = start; index < end; index += 1) {
    const op = ops[index]!;
    if (op.type === "eq") {
      oldCount += 1;
      newCount += 1;
      oldBody.push(op.line);
      newBody.push(op.line);
      patchLines.push(` ${op.line}`);
      reverseLines.push(` ${op.line}`);
    } else if (op.type === "del") {
      oldCount += 1;
      deletions += 1;
      oldBody.push(op.line);
      patchLines.push(`-${op.line}`);
      reverseLines.push(`+${op.line}`);
    } else {
      newCount += 1;
      additions += 1;
      newBody.push(op.line);
      patchLines.push(`+${op.line}`);
      reverseLines.push(`-${op.line}`);
    }
  }
  const oldStart = oldCount === 0 ? oldPos : oldPos + 1;
  const newStart = newCount === 0 ? newPos : newPos + 1;
  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
  const reverseHeader = `@@ -${newStart},${newCount} +${oldStart},${oldCount} @@`;
  return {
    oldStart: Math.max(oldStart, 0),
    oldLines: oldCount,
    newStart: Math.max(newStart, 0),
    newLines: newCount,
    originalText: oldBody.join(eol),
    proposedText: newBody.join(eol),
    patch: [
      `diff --git a/${path} b/${path}`,
      `--- ${oldLines.length === 0 ? "/dev/null" : `a/${path}`}`,
      `+++ ${newLines.length === 0 ? "/dev/null" : `b/${path}`}`,
      header,
      ...patchLines,
    ].join("\n"),
    reversePatch: [
      `diff --git a/${path} b/${path}`,
      `--- ${newLines.length === 0 ? "/dev/null" : `a/${path}`}`,
      `+++ ${oldLines.length === 0 ? "/dev/null" : `b/${path}`}`,
      reverseHeader,
      ...reverseLines,
    ].join("\n"),
    additions,
    deletions,
  };
}

export function diffTexts(path: string, original: string | null, proposed: string | null): {
  hunks: ComputedHunk[];
  additions: number;
  deletions: number;
  eol: "\n" | "\r\n";
} {
  const oldSet = splitLines(original ?? "");
  const newSet = splitLines(proposed ?? "");
  const eol = newSet.lines.length ? newSet.eol : oldSet.eol;
  const ops = diffLines(oldSet.lines, newSet.lines);
  const edits = countEdits(ops);
  return {
    hunks: hunksFromOps(path, oldSet.lines, newSet.lines, ops, eol),
    additions: edits.additions,
    deletions: edits.deletions,
    eol,
  };
}

export function toAiHunks(fileChangeId: string, hunks: ComputedHunk[], toolCallId: string | undefined, now: number, id: () => string): AiChangeHunk[] {
  return hunks.map((hunk) => ({
    id: id(),
    fileChangeId,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    originalText: hunk.originalText,
    proposedText: hunk.proposedText,
    patch: hunk.patch,
    reversePatch: hunk.reversePatch,
    status: "pending",
    toolCallId,
    createdAt: now,
  }));
}
