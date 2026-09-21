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

export function pathOverlap(path: string, candidates: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return candidates.some((candidate) => {
    const other = candidate.replace(/\\/g, "/").toLowerCase();
    return normalized === other || normalized.endsWith(`/${other}`) || other.endsWith(`/${normalized}`)
      || normalized.includes(other) || other.includes(normalized);
  });
}
