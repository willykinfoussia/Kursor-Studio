import type { ContextFileStore, ContextSlice } from "../context/types";
import { clipText, estimateTokens } from "../context/tokens";
import { MAX_RULE_CHARS } from "../context/budget";
import { CONTEXT_PRIORITIES } from "../context/types";

export type RuleLayer = "user" | "project" | "agent";

export interface LoadedRule {
  path: string;
  layer: RuleLayer;
  content: string;
}

export interface RuleLoaderOptions {
  projectFiles?: ContextFileStore;
  /** Root of `{appData}/kursor` — lists `rules/*.md`. */
  userFiles?: ContextFileStore;
  agentId?: string;
}

export class RuleLoader {
  constructor(private readonly options: RuleLoaderOptions = {}) {}

  async load(hasProject: boolean): Promise<LoadedRule[]> {
    const rules: LoadedRule[] = [];
    if (hasProject && this.options.projectFiles) {
      const overlay = await readIfPresent(
        this.options.projectFiles,
        `.kursor/agents/${this.options.agentId ?? "coding-agent"}.md`,
      );
      if (overlay) rules.push({ path: `.kursor/agents/${this.options.agentId ?? "coding-agent"}.md`, layer: "agent", content: overlay });
      rules.push(...await loadProjectRules(this.options.projectFiles));
    }
    if (this.options.userFiles) {
      rules.push(...await loadMarkdownDir(this.options.userFiles, "rules", "user"));
    }
    return rules;
  }

  toSlices(rules: readonly LoadedRule[]): ContextSlice[] {
    const slices: ContextSlice[] = [];
    let used = 0;
    for (const rule of rules) {
      const remaining = MAX_RULE_CHARS - used;
      if (remaining <= 0) break;
      const content = clipText(rule.content, remaining);
      used += content.length;
      const label = rule.layer === "user" ? "User" : rule.layer === "agent" ? "Agent" : "Project";
      const text = `${label} rule (${rule.path}):\n${content}`;
      slices.push({
        id: `rule:${rule.layer}:${rule.path}`,
        source: "rule",
        priority: CONTEXT_PRIORITIES.projectRules,
        score: scoreFor(rule),
        tokens: estimateTokens(text),
        text,
        meta: { path: rule.path, layer: rule.layer },
      });
    }
    return slices;
  }
}

async function loadProjectRules(files: ContextFileStore): Promise<LoadedRule[]> {
  const found: LoadedRule[] = [];
  const kursor = await readIfPresent(files, "KURSOR.md");
  if (kursor) found.push({ path: "KURSOR.md", layer: "project", content: kursor });
  const agents = await readIfPresent(files, "AGENTS.md");
  if (agents) found.push({ path: "AGENTS.md", layer: "project", content: agents });
  found.push(...await loadMarkdownDir(files, ".kursor/rules", "project"));
  return found;
}

async function loadMarkdownDir(
  files: ContextFileStore,
  directory: string,
  layer: RuleLayer,
): Promise<LoadedRule[]> {
  const entries = await files.listDirectory(directory).catch(() => []);
  return Promise.all(entries
    .filter((entry) => entry.kind === "file" && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.path.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b))
    .map(async (path) => {
      const content = await readIfPresent(files, path);
      return content ? { path, layer, content } : null;
    }))
    .then((items) => items.filter((item): item is LoadedRule => Boolean(item)));
}

async function readIfPresent(files: ContextFileStore, path: string) {
  const raw = await files.readFile(path).catch(() => "");
  return raw.trim() ? raw.trim() : "";
}

function scoreFor(rule: LoadedRule) {
  if (rule.layer === "user") return 1;
  if (rule.path === "KURSOR.md") return 0.95;
  if (rule.path === "AGENTS.md") return 0.8;
  if (rule.layer === "agent") return 0.4;
  return 0.5;
}
