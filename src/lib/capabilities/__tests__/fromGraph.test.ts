import { describe, expect, it } from "vitest";
import { capabilityIdFromNode, capabilityTypeFromNode } from "../fromGraph";
import { capabilitiesUsedInGraph } from "../usedInGraph";
import type { AgentGraphNode } from "../../workflow/types";

function node(partial: Partial<AgentGraphNode> & Pick<AgentGraphNode, "id" | "type" | "label">): AgentGraphNode {
  return {
    runId: "run-1",
    status: "completed",
    timestamp: 1,
    ...partial,
  };
}

describe("graph capability references", () => {
  it("resolves stable ids from skill, tool and mcp nodes", () => {
    const skill = node({ id: "skill:prefer-const", type: "skill", label: "prefer-const", metadata: { skillId: "prefer-const" } });
    const tool = node({ id: "tool:t1", type: "file", label: "read_file", metadata: { tool: "read_file" } });
    const mcp = node({
      id: "tool:t2",
      type: "mcp_tool",
      label: "search_issues",
      metadata: { tool: "mcp__github__search_issues", mcpServerId: "github", mcpToolName: "search_issues" },
    });
    expect(capabilityIdFromNode(skill)).toBe("builtin.skill.prefer-const");
    expect(capabilityTypeFromNode(skill)).toBe("skill");
    expect(capabilityIdFromNode(tool)).toBe("builtin.tool.read_file");
    expect(capabilityIdFromNode(mcp)).toBe("mcp.github.tool.search_issues");
    expect(capabilityTypeFromNode(mcp)).toBe("mcp");
  });

  it("groups used capabilities without inventing causality", () => {
    const grouped = capabilitiesUsedInGraph([
      node({ id: "tool:1", type: "file", label: "read_file", metadata: { tool: "read_file", capabilityId: "builtin.tool.read_file", capabilityType: "tool" } }),
      node({ id: "tool:2", type: "file", label: "read_file", metadata: { tool: "read_file", capabilityId: "builtin.tool.read_file", capabilityType: "tool" } }),
      node({ id: "tool:3", type: "mcp_tool", label: "echo", metadata: { mcpServerId: "mock", capabilityType: "mcp" } }),
      node({ id: "mcp-server:mock", type: "mcp_server", label: "mock", metadata: { mcpServerId: "mock" } }),
    ]);
    expect(grouped.tools[0]).toMatchObject({ capabilityId: "builtin.tool.read_file", count: 2 });
    expect(grouped.mcp[0]?.capabilityId).toBe("mcp.mock");
    expect(grouped.mcp[0]?.count).toBe(1);
  });
});
