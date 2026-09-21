import { isGroupableTool } from "../agent/conversation/toolMeta";
import { shouldKeepToolSeparate } from "../agent/conversation/toolGrouping";
import type { WorkStatus } from "../agent/types";

export function shouldCollapseIntoToolGroup(tool: string, status?: WorkStatus) {
  return isGroupableTool(tool) && !shouldKeepToolSeparate(tool, status);
}
