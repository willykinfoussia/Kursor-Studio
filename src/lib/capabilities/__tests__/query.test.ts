import { describe, expect, it } from "vitest";
import { applyCapabilityFilters, catalogItems, countByType, matchesQuery } from "../query";
import type { CapabilitySummary } from "../types";

function item(partial: Partial<CapabilitySummary> & Pick<CapabilitySummary, "id" | "type" | "kind" | "name">): CapabilitySummary {
  return {
    displayName: partial.name,
    source: { type: "builtin", name: "Kursor" },
    enabled: true,
    status: "enabled",
    tags: [],
    agentIds: ["coding"],
    searchText: `${partial.name} ${partial.description ?? ""} builtin`.toLowerCase(),
    ...partial,
  };
}

describe("capability query", () => {
  const items = [
    item({ id: "builtin.skill.react", type: "skill", kind: "skill", name: "React Development", description: "Guidelines" }),
    item({ id: "builtin.tool.read_file", type: "tool", kind: "tool", name: "read_file", description: "Read a file", category: "filesystem", riskLevel: "low" }),
    item({ id: "mcp.github", type: "mcp", kind: "mcp", name: "GitHub", searchText: "github search_repository mcp" }),
    item({ id: "mcp.github.tool.search_repository", type: "mcp", kind: "mcp-tool", parentId: "mcp.github", name: "search_repository", searchText: "search_repository github" }),
  ];

  it("hides nested MCP tools until search", () => {
    expect(catalogItems(items, "").map((entry) => entry.id)).toEqual([
      "builtin.skill.react",
      "builtin.tool.read_file",
      "mcp.github",
    ]);
    expect(catalogItems(items, "search").some((entry) => entry.kind === "mcp-tool")).toBe(true);
  });

  it("filters by type, source, risk and query", () => {
    expect(applyCapabilityFilters(items, { type: "tool" }, "").map((entry) => entry.id)).toEqual(["builtin.tool.read_file"]);
    expect(matchesQuery(items[1]!, "filesystem")).toBe(false);
    expect(applyCapabilityFilters(items, { type: "all", risk: ["low"] }, "read").map((entry) => entry.id)).toEqual(["builtin.tool.read_file"]);
    expect(countByType(items)).toEqual({ all: 3, skill: 1, tool: 1, mcp: 1 });
  });
});
