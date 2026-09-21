import { BUILTIN_AGENTS } from "../agent/agents/builtin";

function matchesTool(name: string, pattern: string) {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

export function agentsForTool(toolName: string) {
  return BUILTIN_AGENTS
    .filter((agent) => agent.tools.some((pattern) => matchesTool(toolName, pattern)))
    .map((agent) => ({ id: agent.id, name: agent.name }));
}

export function allAgentIds() {
  return BUILTIN_AGENTS.map((agent) => agent.id);
}
