import { describe, expect, it } from "vitest";
import { builtInMcpRegistry } from "../registry";

describe("BuiltInMCPRegistry", () => {
  it("exposes exactly the four first-class MCP integrations", () => {
    const ids = builtInMcpRegistry.list().map((item) => item.id);
    expect(ids).toEqual([
      "builtin.mcp.blender",
      "builtin.mcp.composio",
      "builtin.mcp.github",
      "builtin.mcp.playwright",
    ]);
    expect(builtInMcpRegistry.get("blender")?.serverId).toBe("blender");
    expect(builtInMcpRegistry.get("github")?.serverId).toBe("github");
    expect(builtInMcpRegistry.get("unknown")).toBeNull();
  });

  it("keeps catalog entries known until a snapshot exists", () => {
    const [blender] = builtInMcpRegistry.instances([]);
    expect(blender?.status).toBe("known");
    expect(blender?.snapshot).toBeNull();
  });
});
