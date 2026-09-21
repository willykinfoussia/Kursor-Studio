import { describe, expect, it } from "vitest";
import { MCPConfigurationManager } from "../MCPConfigurationManager";
import { MCPRegistry } from "../MCPRegistry";
import { MCPRuntime } from "../MCPRuntime";
import { MCPServerManager } from "../MCPServerManager";
import { ToolRegistry } from "../../agent/ToolRegistry";
import { MemoryMCPHost, mockServer } from "./memoryHost";
import { buildGitHubConfig } from "../builtin/github";
import { buildBlenderConfig } from "../builtin/blender";

describe("MCPConfigurationManager", () => {
  function harness() {
    const host = new MemoryMCPHost();
    const runtime = new MCPRuntime(host);
    const tools = new ToolRegistry();
    const registry = new MCPRegistry(tools, runtime);
    const manager = new MCPServerManager(runtime);
    return { host, config: new MCPConfigurationManager(manager, registry), runtime };
  }

  it("saves loads updates and disables builtin settings without plaintext secrets", async () => {
    const { config } = harness();
    const saved = await config.saveBuiltin("builtin.mcp.github", { access: "read-only", toolsets: ["repos"] }, { trusted: true });
    expect(saved.id).toBe("github");
    expect(saved.origin).toBe("builtin");
    expect(saved.env?.some((item) => item.secretRef && item.value)).toBe(false);
    const loaded = await config.load("github");
    expect(loaded?.metadata?.settings).toMatchObject({ access: "read-only" });
    const updated = await config.saveBuiltin("builtin.mcp.github", { access: "advanced", toolsets: ["repos", "actions"] });
    const diff = config.diff(loaded, updated);
    expect(diff.some((entry) => entry.path === "settings.access" && entry.to.includes("advanced"))).toBe(true);
    const disabled = await config.disable("github");
    expect(disabled.enabled).toBe(false);
    expect(disabled.status).toBe("disabled");
  });

  it("keeps disconnected servers configured and redacts secrets in dry-run output", () => {
    const { config } = harness();
    const built = buildGitHubConfig({ access: "standard" });
    const redacted = config.redactConfig(built);
    expect(JSON.stringify(redacted)).not.toContain("secret://");
    expect(config.isIncomplete(mockServer("github"))).toBe(false);
    const blender = buildBlenderConfig({ repoPath: "C:/lab/blender_mcp" });
    expect(blender.command).toBe("uv");
    expect(blender.args).toContain("blender-mcp");
  });
});
