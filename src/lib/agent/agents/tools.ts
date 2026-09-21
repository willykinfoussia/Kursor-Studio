import type { ToolRegistry } from "../ToolRegistry";
import type { AgentDefinition } from "./types";
import { resolveAgentTools } from "../../capabilities/CapabilityResolver";
import { isMcpRuntimeName } from "../../mcp/types";

export function resolveDefinitionTools(definition: AgentDefinition, registry: ToolRegistry) {
  const tools = resolveAgentTools(registry, { allowedTools: [...definition.tools] });
  if (definition.id === "explore" || definition.permissionMode === "read-only") {
    return tools.filter((tool) => !isMcpRuntimeName(tool.name) || !tool.mutate);
  }
  return tools;
}

export function deniedToolsFor(definition: AgentDefinition, registry: ToolRegistry): string[] {
  const allowed = new Set(resolveDefinitionTools(definition, registry).map((tool) => tool.name));
  return registry.listEnabled()
    .map((tool) => tool.name)
    .filter((name) => !allowed.has(name));
}
