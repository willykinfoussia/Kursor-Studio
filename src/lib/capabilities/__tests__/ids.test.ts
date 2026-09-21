import { describe, expect, it } from "vitest";
import {
  capabilityIdFromRuntimeTool,
  mcpServerCapabilityId,
  parseMcpServerCapabilityId,
  parseMcpToolCapabilityId,
  parseSkillCapabilityId,
  skillCapabilityId,
} from "../ids";
import { builtinToolCapabilityId, capabilityToolId } from "../../mcp/ids";

describe("capability ids", () => {
  it("builds stable skill namespaces", () => {
    expect(skillCapabilityId("builtin", "prefer-const")).toBe("builtin.skill.prefer-const");
    expect(skillCapabilityId("project", "react")).toBe("project.skill.react");
    expect(skillCapabilityId("global", "prefs")).toBe("user.skill.prefs");
    expect(skillCapabilityId("builtin", "builtin.skill.prefer-const")).toBe("builtin.skill.prefer-const");
    expect(parseSkillCapabilityId("project.skill.react")).toEqual({ origin: "project", skillId: "react" });
  });

  it("keeps canonical MCP and builtin tool ids", () => {
    expect(builtinToolCapabilityId("read_file")).toBe("builtin.tool.read_file");
    expect(capabilityIdFromRuntimeTool("read_file")).toBe("builtin.tool.read_file");
    expect(capabilityIdFromRuntimeTool("mcp__github__search_issues")).toBe(capabilityToolId("github", "search_issues"));
    expect(capabilityToolId("github", "search_issues")).toBe("mcp.github.tool.search_issues");
    expect(mcpServerCapabilityId("github")).toBe("mcp.github");
    expect(parseMcpServerCapabilityId("mcp.github")).toBe("github");
    expect(parseMcpServerCapabilityId("mcp.github.tool.search_issues")).toBeNull();
    expect(parseMcpToolCapabilityId("mcp.github.tool.search_issues")).toEqual({
      serverId: "github",
      toolName: "search_issues",
    });
  });
});
