export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface ParsedPatch {
  oldFile: string;
  newFile: string;
  preamble: string[];
  hunks: DiffHunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedPatch(diff: string): ParsedPatch[] {
  const files: ParsedPatch[] = [];
  let current: ParsedPatch | null = null;
  let hunk: DiffHunk | null = null;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("diff --git ")) {
      hunk = null;
      current = { oldFile: "", newFile: "", preamble: [raw], hunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    const hunkMatch = raw.match(HUNK_RE);
    if (hunkMatch) {
      hunk = {
        oldStart: Number(hunkMatch[1]),
        oldLines: Number(hunkMatch[2] ?? "1"),
        newStart: Number(hunkMatch[3]),
        newLines: Number(hunkMatch[4] ?? "1"),
        header: raw,
        lines: [],
      };
      current.hunks.push(hunk);
      continue;
    }
    if (hunk && (raw.startsWith(" ") || raw.startsWith("+") || raw.startsWith("-") || raw.startsWith("\\"))) {
      hunk.lines.push(raw);
      continue;
    }
    current.preamble.push(raw);
    if (raw.startsWith("--- ")) current.oldFile = stripPath(raw.slice(4));
    if (raw.startsWith("+++ ")) current.newFile = stripPath(raw.slice(4));
  }
  return files;
}

export function patchForHunk(file: ParsedPatch, hunk: DiffHunk): string {
  const oldFile = file.oldFile || file.newFile || "a";
  const newFile = file.newFile || file.oldFile || "b";
  return [
    ...file.preamble,
    file.preamble.some((line) => line.startsWith("--- ")) ? null : `--- a/${oldFile}`,
    file.preamble.some((line) => line.startsWith("+++ ")) ? null : `+++ b/${newFile}`,
    hunk.header,
    ...hunk.lines,
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function patchForFiles(files: ParsedPatch[]): string {
  return files
    .flatMap((file) => file.hunks.map((hunk) => patchForHunk(file, hunk)))
    .join("\n");
}

function stripPath(value: string) {
  const trimmed = value.trim().replace(/^[ab]\//, "");
  return trimmed === "/dev/null" ? "" : trimmed;
}
