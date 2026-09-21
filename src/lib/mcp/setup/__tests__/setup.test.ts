import { describe, expect, it } from "vitest";
import { DependencyDetector } from "../DependencyDetector";
import { MemorySystemDetector } from "../ExecutableLocator";
import { SetupValidator } from "../SetupValidator";
import { MCPSetupWizard } from "../MCPSetupWizard";
import { builtInMcpRegistry } from "../../builtin/registry";
import { secretStore, mcpSecretKey } from "../../../agent/SecretStore";

describe("MCP setup validation", () => {
  it("rejects missing blender, credentials, and invalid stdio config", async () => {
    const sys = new MemorySystemDetector();
    const detector = new DependencyDetector(sys, async () => false);
    const validator = new SetupValidator(detector);
    const blender = builtInMcpRegistry.get("builtin.mcp.blender")!;
    const missing = await validator.validateDefinition(blender, {});
    expect(missing.blender?.status).toBe("error");
    expect(missing.uv?.status).toBe("error");

    sys.blender = { installed: true, compatible: true, version: "5.1.0", required: "5.1", path: "/Blender" };
    sys.executables.set("uv", { name: "uv", found: true, path: "/uv" });
    sys.tcp.add("127.0.0.1:9876");
    const ok = await validator.validateDefinition(blender, { repoPath: "C:/blender_mcp" }, blender.buildConfig({ repoPath: "C:/blender_mcp" }));
    expect(ok.blender?.status).toBe("valid");
    expect(ok.config?.status).toBe("valid");

    const github = builtInMcpRegistry.get("builtin.mcp.github")!;
    const account = await detector.checkAll(github, {});
    expect(account["github-account"]?.status).toBe("error");

    const composio = builtInMcpRegistry.get("builtin.mcp.composio")!;
    const key = await detector.checkAll(composio, {});
    expect(key["api-key"]?.status).toBe("error");
    await secretStore.set(mcpSecretKey("composio", "COMPOSIO_API_KEY"), "test-key");
    expect((await detector.checkAll(composio, {}))["api-key"]?.status).toBe("valid");
  });

  it("blocks continue while a required dependency is missing", () => {
    const wizard = new MCPSetupWizard("builtin.mcp.playwright");
    expect(wizard.currentStep().id).toBe("node");
    expect(wizard.state.canContinue).toBe(false);
  });
});
