import { fileName } from "../filesystem/pathUtils";
import { mentionedPaths } from "../agent/context/tokens";
import { fileBasename, normalizeGraphPath } from "./ids";
import { graphTokens } from "./tokenize";
import type { ProjectGraph } from "./ProjectGraph";
import type { RelatedFile, ResolvedContext, TraversalOptions } from "./types";

export interface ResolveSeeds {
  query?: string;
  paths?: string[];
}

export class ContextResolver {
  resolve(graph: ProjectGraph, seeds: ResolveSeeds, options: TraversalOptions = {}): ResolvedContext {
    const maxFiles = options.maxFiles ?? 12;
    const roots = unique(this.seedPaths(graph, seeds));
    const files: string[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      if (seen.has(root)) continue;
      seen.add(root);
      files.push(root);
      if (files.length >= maxFiles) break;
      const related = graph.getRelatedFiles(root, { ...options, maxFiles: maxFiles - files.length });
      for (const item of related) {
        if (seen.has(item.path)) continue;
        seen.add(item.path);
        files.push(item.path);
        if (files.length >= maxFiles) break;
      }
    }
    return { root: roots[0] ?? "", files };
  }

  seedPaths(graph: ProjectGraph, seeds: ResolveSeeds): string[] {
    const ordered: string[] = [];
    for (const path of seeds.paths ?? []) {
      const node = graph.getNode(path);
      if (node) ordered.push(node.path);
    }
    const query = seeds.query?.trim() ?? "";
    if (query) {
      for (const mentioned of mentionedPaths(query)) {
        const node = graph.getNode(mentioned);
        if (node) ordered.push(node.path);
      }
      const tokens = new Set(graphTokens(query));
      const scored = graph.getNodes().map((node) => {
        let score = 0;
        const base = fileBasename(node.path);
        const name = fileName(node.path).toLowerCase();
        if (query.toLowerCase().includes(base) || query.toLowerCase().includes(name)) score += 3;
        if (tokens.has(base)) score += 2;
        for (const token of node.tokens) {
          if (tokens.has(token)) score += 0.15;
        }
        return { path: node.path, score };
      }).filter((item) => item.score > 0);
      scored.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      for (const item of scored.slice(0, 5)) ordered.push(item.path);
    }
    return unique(ordered.map(normalizeGraphPath));
  }
}

export const contextResolver = new ContextResolver();

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

export type { RelatedFile };
