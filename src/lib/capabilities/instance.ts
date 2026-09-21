import { mcpRegistry } from "../mcp/MCPRegistry";
import { skillRegistry } from "../agent/skills/SkillRegistry";
import { toolRegistry } from "../agent/ToolRegistry";
import { CapabilityRegistry } from "./CapabilityRegistry";
import { CapabilityService } from "./CapabilityService";

export const capabilityRegistry = new CapabilityRegistry(toolRegistry, skillRegistry, mcpRegistry);
export const capabilityService = new CapabilityService(capabilityRegistry);
