import { STOP_WORDS } from "./config";

export function graphTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const raw of lower.split(/[^a-z0-9_]+/)) {
    if (!raw || raw.length < 3 || STOP_WORDS.has(raw) || /^[0-9]+$/.test(raw)) continue;
    pushToken(seen, tokens, raw);
    if (raw.includes("_")) {
      for (const part of raw.split("_")) {
        if (part.length >= 3 && !STOP_WORDS.has(part)) pushToken(seen, tokens, part);
      }
    }
    for (const part of splitCamel(raw)) {
      if (part.length >= 3 && !STOP_WORDS.has(part)) pushToken(seen, tokens, part);
    }
  }
  tokens.sort((left, right) => left.localeCompare(right));
  return tokens;
}

export function jaccard(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const b = new Set(right);
  let intersection = 0;
  const union = new Set(left);
  for (const token of left) {
    if (b.has(token)) intersection += 1;
  }
  for (const token of right) union.add(token);
  if (union.size === 0) return 0;
  return intersection / union.size;
}

export function uniqueSorted(values: readonly string[]): string[] {
  const next = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  next.sort((left, right) => left.localeCompare(right));
  return next;
}

function pushToken(seen: Set<string>, tokens: string[], token: string) {
  if (seen.has(token)) return;
  seen.add(token);
  tokens.push(token);
}

function splitCamel(value: string): string[] {
  return value.split(/(?<=[a-z])(?=[a-z]*[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).map((part) => part.toLowerCase());
}
