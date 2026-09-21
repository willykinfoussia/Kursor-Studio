export function normalizeStreamingMarkdown(source: string) {
  const fences = source.match(/```/g)?.length ?? 0;
  if (fences % 2 === 1) return ensureGfmTables(`${source}\n\`\`\``);
  return ensureGfmTables(source);
}

export function ensureGfmTables(source: string) {
  const lines = source.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (isTableRow(line) && prev !== undefined && prev.trim() !== "" && !isTableRow(prev)) {
      out.push("");
    }
    out.push(line);
  }
  return out.join("\n");
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("|", 1);
}
