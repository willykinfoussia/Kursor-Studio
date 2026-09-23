export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function clipText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1)}…`;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function lexicalScore(query: string, text: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const haystack = new Set(tokenize(text));
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) hits += 1;
  }
  return hits / queryTokens.length;
}

export function mentionedPaths(query: string): string[] {
  const matches = query.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g) ?? [];
  const unique = [...new Set(matches.map((item) => item.replace(/\\/g, "/")))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

export interface FileMentionSpan {
  path: string;
  start: number;
  end: number;
}

export interface ActiveAtQuery {
  query: string;
  start: number;
  end: number;
}

function cleanMentionPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, "/").trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized === "..") return null;
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("~")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

export function fileMentionSpans(query: string): FileMentionSpan[] {
  const spans: FileMentionSpan[] = [];
  const pattern = /(?:^|[\s(])@(?:"([^"\n]+)"|([^\s@"]+))/g;
  let match: RegExpExecArray | null = pattern.exec(query);
  while (match) {
    const quoted = match[1];
    let raw = quoted ?? match[2] ?? "";
    let end = match.index + match[0].length;
    if (!quoted) {
      const trimmed = raw.replace(/[.,;:)>]+$/g, "");
      end -= raw.length - trimmed.length;
      raw = trimmed;
    }
    const path = cleanMentionPath(raw);
    if (path) {
      const start = query.indexOf("@", match.index);
      if (start >= 0 && end > start) spans.push({ path, start, end });
    }
    match = pattern.exec(query);
  }
  return spans;
}

export function atFileMentions(query: string): string[] {
  const unique = [...new Set(fileMentionSpans(query).map((span) => span.path))];
  unique.sort((left, right) => left.localeCompare(right));
  return unique;
}

export function activeAtQuery(value: string, caret: number): ActiveAtQuery | null {
  const before = value.slice(0, Math.max(0, caret));
  const quoted = /(?:^|[\s(])@"([^"\n]*)$/.exec(before);
  if (quoted) {
    const start = before.lastIndexOf("@");
    if (start < 0) return null;
    return { query: quoted[1] ?? "", start, end: Math.max(0, caret) };
  }
  const plain = /(?:^|[\s(])@([^\s@"]*)$/.exec(before);
  if (!plain) return null;
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  return { query: plain[1] ?? "", start, end: Math.max(0, caret) };
}

export function formatFileMention(path: string): string {
  const normalized = cleanMentionPath(path) ?? path.replace(/\\/g, "/").trim();
  if (/[\s"]/.test(normalized)) return `@"${normalized.replace(/"/g, "")}"`;
  return `@${normalized}`;
}

export function pathOverlap(path: string, candidates: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return candidates.some((candidate) => {
    const other = candidate.replace(/\\/g, "/").toLowerCase();
    return normalized === other || normalized.endsWith(`/${other}`) || other.endsWith(`/${normalized}`)
      || normalized.includes(other) || other.includes(normalized);
  });
}
