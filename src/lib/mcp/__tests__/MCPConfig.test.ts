import { describe, expect, it } from "vitest";
import { importClaudeMcpJson, validateServerConfig } from "../MCPConfig";

describe("MCPConfig", () => {
  it("rejects stdio without a command and plaintext secrets", () => {
    expect(validateServerConfig({ id: "x", name: "x", transport: "stdio" }).valid).toBe(false);
    expect(validateServerConfig({
      id: "x",
      name: "x",
      transport: "stdio",
      command: "npx",
      env: [{ name: "GITHUB_TOKEN", value: "ghp_secret", required: true }],
    }).valid).toBe(false);
  });

  it("imports Claude mcpServers and rewrites secret-looking env to secretRef", () => {
    const imported = importClaudeMcpJson({
      mcpServers: {
        mock: { command: "node", args: ["examples/mcp/mock-server.mjs"] },
        github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } },
      },
    });
    expect(imported.servers[0]?.command).toBe("node");
    const github = imported.servers.find((item) => item.id === "github");
    expect(github?.env?.[0]?.secretRef).toBe("secret://github/GITHUB_TOKEN");
    expect(github?.env?.[0]?.value).toBeUndefined();
    expect(github?.trust).toBe("untrusted");
  });

  it("rejects legacy SSE entries", () => {
    const imported = importClaudeMcpJson({
      mcpServers: {
        remote: { type: "sse", url: "https://example.com/sse" },
      },
    });
    expect(imported.errors.some((item) => item.message.toLowerCase().includes("sse"))).toBe(true);
    expect(validateServerConfig(imported.servers[0]!).valid).toBe(false);
  });
});
