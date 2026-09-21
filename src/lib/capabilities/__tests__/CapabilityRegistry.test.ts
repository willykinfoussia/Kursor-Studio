import { describe, expect, it } from "vitest";
import { ToolRegistry, type AgentTool } from "../../agent/ToolRegistry";
import { SkillRegistry } from "../../agent/skills/SkillRegistry";
import type { MCPRegistry } from "../../mcp/MCPRegistry";
import { okResult } from "../../agent/tools/result";
import { toolSchema } from "../../agent/tools/schema";
import { toolPermission } from "../../agent/permissions/meta";
import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityService } from "../CapabilityService";

function tool(name: string): AgentTool {
  return {
    name,
    description: `${name} description`,
    ...toolPermission(name.startsWith("mcp__") ? "mcp.invoke" : "filesystem.read", "low"),
    parameters: toolSchema({}),
    timeoutMs: 1000,
    mutate: false,
    execute: async () => okResult({}),
  };
}

const emptyMcp = {
  listServers: () => [],
  discoveryFor: () => undefined,
} as unknown as MCPRegistry;

describe("CapabilityRegistry", () => {
  it("lists builtin tools and skills with stable ids", async () => {
    const tools = new ToolRegistry();
    tools.register(tool("read_file"));
    tools.register(tool("mcp__github__search_issues"));
    const skills = new SkillRegistry({ includeBuiltins: true, getDisabledIds: () => [] });
    const registry = new CapabilityRegistry(tools, skills, emptyMcp, () => []);
    const listed = await registry.list();
    expect(listed.some((item) => item.id === "builtin.tool.read_file")).toBe(true);
    expect(listed.some((item) => item.id === "builtin.skill.prefer-const")).toBe(true);
    expect(listed.some((item) => item.id === "builtin.skill.search-first")).toBe(true);
    expect(listed.some((item) => item.id.startsWith("mcp.mcp."))).toBe(false);
    const detail = await registry.get("builtin.tool.read_file");
    expect(detail?.type).toBe("tool");
    expect(detail && "inputSchema" in detail).toBe(true);
  });

  it("omits disabled tools from resolve and list status", async () => {
    const tools = new ToolRegistry();
    tools.register(tool("read_file"));
    tools.register(tool("write_file"));
    const disabled = ["builtin.tool.write_file"];
    const skills = new SkillRegistry({ includeBuiltins: true, getDisabledIds: () => disabled });
    const registry = new CapabilityRegistry(tools, skills, emptyMcp, () => disabled);
    const visible = registry.resolve({});
    expect(visible.map((item) => item.name)).toEqual(["read_file"]);
    const write = (await registry.list()).find((item) => item.id === "builtin.tool.write_file");
    expect(write?.enabled).toBe(false);
    expect(write?.status).toBe("disabled");
  });

  it("finds skills by trigger text", async () => {
    const tools = new ToolRegistry();
    const skills = new SkillRegistry({ includeBuiltins: true, getDisabledIds: () => [] });
    const registry = new CapabilityRegistry(tools, skills, emptyMcp, () => []);
    const found = await registry.find("typescript");
    expect(found.some((item) => item.id === "builtin.skill.prefer-const")).toBe(true);
  });

  it("lists project skills from .kursor/skills in the catalog", async () => {
    const files = {
      readFile: async (path: string) => {
        if (path.endsWith("search-first/SKILL.md")) {
          return "---\nname: search-first\ndescription: Search the repo first.\n---\nSearch.";
        }
        if (path.endsWith("tdd-workflow/SKILL.md")) {
          return "---\nname: tdd-workflow\ndescription: Write a failing test first.\n---\nTDD.";
        }
        return "";
      },
      listDirectory: async (path: string) => {
        if (path !== ".kursor/skills") return [];
        return [
          { name: "search-first", path: ".kursor/skills/search-first", kind: "directory" as const },
          { name: "tdd-workflow", path: ".kursor/skills/tdd-workflow", kind: "directory" as const },
        ];
      },
    };
    const skills = new SkillRegistry({ includeBuiltins: true, files, getDisabledIds: () => [] });
    const registry = new CapabilityRegistry(new ToolRegistry(), skills, emptyMcp, () => []);
    const listed = await registry.list();
    expect(listed.some((item) => item.id === "builtin.skill.prefer-const")).toBe(true);
    expect(listed.some((item) => item.id === "project.skill.search-first")).toBe(true);
    expect(listed.some((item) => item.id === "project.skill.tdd-workflow")).toBe(true);
  });
});

describe("CapabilityService skill CRUD", () => {
  it("refuses to update or delete a builtin skill", async () => {
    const service = new CapabilityService(
      new CapabilityRegistry(new ToolRegistry(), new SkillRegistry({ includeBuiltins: true, getDisabledIds: () => [] }), emptyMcp, () => []),
    );
    await expect(service.deleteSkill("builtin.skill.prefer-const")).rejects.toMatchObject({
      code: "builtin_readonly",
    });
    await expect(service.updateSkill("builtin.skill.prefer-const", { id: "prefer-const" })).rejects.toMatchObject({
      code: "builtin_readonly",
    });
  });
});
