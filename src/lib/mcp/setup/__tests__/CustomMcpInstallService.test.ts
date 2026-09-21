import { describe, expect, it } from "vitest";
import { MemorySecretStore } from "../../../agent/SecretStore";
import { MCPConfigurationManager } from "../../MCPConfigurationManager";
import { MCPRegistry } from "../../MCPRegistry";
import { MCPRuntime } from "../../MCPRuntime";
import { MCPServerManager } from "../../MCPServerManager";
import { ToolRegistry } from "../../../agent/ToolRegistry";
import { MemoryMCPHost } from "../../__tests__/memoryHost";
import { CustomMcpInstallService } from "../CustomMcpInstallService";

function harness() {
  const host = new MemoryMCPHost();
  const runtime = new MCPRuntime(host);
  const tools = new ToolRegistry();
  const registry = new MCPRegistry(tools, runtime);
  const manager = new MCPServerManager(runtime);
  const secrets = new MemorySecretStore();
  const install = new CustomMcpInstallService(manager, secrets);
  const config = new MCPConfigurationManager(manager, registry, install);
  return { host, manager, secrets, install, config };
}

describe("CustomMcpInstallService", () => {
  it("imports Claude JSON as untrusted without plaintext secrets", async () => {
    const { install, host } = harness();
    const result = await install.install({
      mcpServers: {
        mock: { command: "node", args: ["examples/mcp/mock-server.mjs"] },
        docs: { command: "npx", args: ["-y", "docs-mcp"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } },
      },
    });
    expect(result.servers).toHaveLength(2);
    expect(result.servers.every((server) => server.origin === "imported")).toBe(true);
    expect(result.servers.every((server) => server.trust === "untrusted")).toBe(true);
    const docs = host.servers.get("docs");
    expect(docs?.env?.[0]?.secretRef).toBe("secret://docs/GITHUB_TOKEN");
    expect(docs?.env?.[0]?.value).toBeUndefined();
    expect(JSON.stringify(docs)).not.toMatch(/ghp_/);
    expect(result.missingSecrets.map((item) => item.envName)).toEqual(["GITHUB_TOKEN"]);
  });

  it("rejects SSE and stdio without a command and does not upsert them", async () => {
    const { install, host } = harness();
    const result = await install.install({
      mcpServers: {
        remote: { type: "sse", url: "https://example.com/sse" },
        broken: { args: ["no-command"] },
        ok: { command: "node", args: ["examples/mcp/mock-server.mjs"] },
      },
    });
    expect(host.servers.has("remote")).toBe(false);
    expect(host.servers.has("broken")).toBe(false);
    expect(host.servers.has("ok")).toBe(true);
    expect(result.servers.map((item) => item.id)).toEqual(["ok"]);
    expect(result.errors.some((item) => item.message.includes("SSE") || item.path.includes("remote"))).toBe(true);
    expect(result.errors.some((item) => item.path.includes("broken") || item.message.includes("command"))).toBe(true);
  });

  it("refuses to overwrite a built-in MCP id", async () => {
    const { install, host } = harness();
    const result = await install.install({
      mcpServers: {
        github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      },
    });
    expect(host.servers.has("github")).toBe(false);
    expect(result.servers).toHaveLength(0);
    expect(result.errors.some((item) => item.message.includes("built-in"))).toBe(true);
  });

  it("clears missingSecrets after storeSecret", async () => {
    const { install } = harness();
    const installed = await install.install({
      mcpServers: {
        docs: { command: "npx", args: ["-y", "docs-mcp"], env: { API_TOKEN: "${API_TOKEN}" } },
      },
    });
    expect(installed.missingSecrets).toHaveLength(1);
    await install.storeSecret("docs", "API_TOKEN", "stored-secret");
    const remaining = await install.missingSecrets(installed.servers[0]!);
    expect(remaining).toEqual([]);
  });
});

describe("MCPConfigurationManager.importCustom", () => {
  it("installs then syncs the registry without trusting the server", async () => {
    const { config, host } = harness();
    const result = await config.importCustom({
      mcpServers: { mock: { command: "node", args: ["examples/mcp/mock-server.mjs"] } },
    });
    expect(result.servers[0]?.trust).toBe("untrusted");
    expect(host.servers.get("mock")?.origin).toBe("imported");
  });
});
