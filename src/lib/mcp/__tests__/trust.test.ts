import { describe, expect, it } from "vitest";
import { pendingProjectMcpTrust } from "../trust";
import { mockServer } from "./memoryHost";

describe("pendingProjectMcpTrust", () => {
  it("lists untrusted project MCP servers from .kursor/mcp.json", () => {
    const trusted = mockServer("github");
    const pending = mockServer("blender");
    pending.origin = "project";
    pending.trust = "untrusted";
    trusted.origin = "builtin";
    trusted.trust = "trusted";
    expect(pendingProjectMcpTrust([trusted, pending]).map((item) => item.id)).toEqual(["blender"]);
  });
});
