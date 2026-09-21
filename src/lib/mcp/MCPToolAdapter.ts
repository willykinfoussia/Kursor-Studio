import { failResult, okResult } from "../agent/tools/result";
import type { AgentTool, JsonSchemaObject, ToolApproval, ToolResult } from "../agent/ToolRegistry";
import { MAX_MCP_TOOL_OUTPUT_CHARS, type MCPCallResult, type MCPServerSnapshot, type MCPToolCapability } from "./types";
import { runtimeToolName } from "./ids";
import { redactValue, stringifyMcpOutput } from "./redact";
import type { MCPRuntime } from "./MCPRuntime";

export function mcpRiskFromAnnotations(
  tool: MCPToolCapability,
  server?: Pick<MCPServerSnapshot, "id" | "metadata">,
): {
  riskLevel: AgentTool["riskLevel"];
  approval: ToolApproval;
  mutate: boolean;
} {
  if (server?.id === "blender" || server?.metadata?.riskLevel === "high") {
    return { riskLevel: "high", approval: "ask", mutate: true };
  }
  const annotations = tool.annotations ?? {};
  if (annotations.destructiveHint) {
    return { riskLevel: "high", approval: "ask", mutate: true };
  }
  if (annotations.readOnlyHint) {
    return { riskLevel: "low", approval: "auto", mutate: false };
  }
  return { riskLevel: "high", approval: "ask", mutate: true };
}

export function schemaFromMcp(inputSchema: unknown): JsonSchemaObject {
  if (inputSchema && typeof inputSchema === "object" && !Array.isArray(inputSchema)) {
    const schema = inputSchema as JsonSchemaObject;
    return {
      type: schema.type ?? "object",
      properties: schema.properties ?? {},
      required: schema.required,
      additionalProperties: schema.additionalProperties,
      ...schema,
    };
  }
  return { type: "object", properties: {} };
}

export function mapMcpCallToToolResult(result: MCPCallResult): ToolResult {
  if (!result.success) {
    const code = result.error?.code ?? "mcp_tool_error";
    return failResult(code, result.error?.message ?? "MCP tool failed.", {
      truncated: result.truncated,
    });
  }
  const packed = stringifyMcpOutput(redactValue(result.data), MAX_MCP_TOOL_OUTPUT_CHARS);
  let data: unknown = packed.text;
  try {
    data = JSON.parse(packed.text);
  } catch {
    data = packed.text;
  }
  return {
    ...okResult(data, { truncated: packed.truncated || result.truncated }),
    durationMs: result.durationMs,
  };
}

export function adaptMcpTool(
  server: MCPServerSnapshot,
  tool: MCPToolCapability,
  runtime: Pick<MCPRuntime, "callTool">,
): AgentTool {
  const risk = mcpRiskFromAnnotations(tool, server);
  const timeoutMs = server.timeoutMs ?? 30_000;
  return {
    name: runtimeToolName(server.id, tool.name),
    description: tool.description || `${server.displayName ?? server.name} · ${tool.name}`,
    parameters: schemaFromMcp(tool.inputSchema),
    category: "mcp",
    risk: risk.mutate ? "execute" : "read",
    approval: risk.approval,
    capability: "mcp.invoke",
    riskLevel: risk.riskLevel,
    timeoutMs,
    mutate: risk.mutate,
    async execute(input, ctx) {
      if (ctx.signal.aborted) return failResult("mcp_cancelled", "MCP tool cancelled.");
      const result = await runtime.callTool(server.id, tool.name, input ?? {}, timeoutMs);
      return mapMcpCallToToolResult(result);
    },
  };
}
