export interface SpecFrontmatter {
  scope?: string;
  type?: string;
  title?: string;
}

export function parseSpecFrontmatter(content: string): { data: SpecFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: content };
  const data: SpecFrontmatter = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/);
    if (!pair) continue;
    const key = pair[1]?.trim().toLowerCase();
    const value = pair[2]?.trim().replace(/^["']|["']$/g, "");
    if (!key || !value) continue;
    if (key === "scope") data.scope = value;
    if (key === "type") data.type = value;
    if (key === "title") data.title = value;
  }
  return { data, body: content.slice(match[0].length) };
}

export function specFrontmatterBlock(scope: "account" | "project", type: string, title: string): string {
  return `---\nscope: ${scope}\ntype: ${type}\ntitle: ${title}\n---\n\n`;
}
