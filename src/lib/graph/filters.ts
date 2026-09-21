import { resolveSpecKind, specScope } from "./classify";
import type { FileCategory, FileNode, GraphEdge, RelationType } from "./types";

export type GraphFilterToken =
  | "all"
  | "account"
  | "project"
  | FileCategory
  | "functional"
  | "business"
  | "ui"
  | "technical"
  | "constraints";

export const GRAPH_SCOPE_FILTERS = ["account", "project"] as const;
export const GRAPH_CATEGORY_FILTERS = ["specifications", "code", "data", "tests", "documentation"] as const;
export const GRAPH_KIND_FILTERS = ["functional", "business", "ui", "technical", "constraints"] as const;
export const GRAPH_FILTER_TOKENS: GraphFilterToken[] = [
  "all",
  ...GRAPH_SCOPE_FILTERS,
  ...GRAPH_CATEGORY_FILTERS,
  ...GRAPH_KIND_FILTERS,
];

const SCOPE_SET = new Set<string>(GRAPH_SCOPE_FILTERS);
const CATEGORY_SET = new Set<string>(GRAPH_CATEGORY_FILTERS);
const KIND_SET = new Set<string>(GRAPH_KIND_FILTERS);

export function toggleGraphFilter(current: GraphFilterToken[], token: GraphFilterToken): GraphFilterToken[] {
  if (token === "all") return ["all"];
  const withoutAll = current.filter((item) => item !== "all");
  const next = withoutAll.includes(token)
    ? withoutAll.filter((item) => item !== token)
    : [...withoutAll, token];
  return next.length === 0 ? ["all"] : next;
}

export function nodeMatchesFilters(node: FileNode, filters: readonly string[]): boolean {
  const active = filters.filter((item) => item !== "all");
  if (active.length === 0) return true;

  const scopes = active.filter((item) => SCOPE_SET.has(item));
  const categories = active.filter((item) => CATEGORY_SET.has(item));
  const kinds = active.filter((item) => KIND_SET.has(item));

  if (scopes.length > 0) {
    const scope = specScope(node.path);
    const isAccount = scope === "account";
    const match = (scopes.includes("account") && isAccount) || (scopes.includes("project") && !isAccount);
    if (!match) return false;
  }

  if (categories.length > 0 && !categories.includes(node.category)) return false;

  if (kinds.length > 0) {
    const kind = resolveSpecKind(node.path, node.metadata);
    if (!kinds.includes(kind)) return false;
  }

  return true;
}

export function edgeMatchesFilters(
  edge: GraphEdge,
  visibleIds: Set<string>,
  relationFilter: "all" | RelationType,
  showUncertain: boolean,
): boolean {
  if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
  if (!showUncertain && edge.status !== "active") return false;
  if (relationFilter !== "all" && edge.relation !== relationFilter) return false;
  return true;
}
