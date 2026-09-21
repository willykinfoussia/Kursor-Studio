const SECRET_KEYS = /(token|secret|password|api[_-]?key|authorization|ghp_|github_pat_)/i;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (SECRET_KEYS.test(value) || looksLikeSecret(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redactValue(item);
    }
    return out;
  }
  return value;
}

export function looksLikeSecret(value: string) {
  return /^(ghp_|github_pat_|sk-|xox[baprs]-)/.test(value.trim());
}

export function truncateOutput(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n[output truncated]`, truncated: true };
}

export function stringifyMcpOutput(data: unknown, maxChars: number) {
  const raw = typeof data === "string" ? data : JSON.stringify(data);
  return truncateOutput(raw, maxChars);
}
