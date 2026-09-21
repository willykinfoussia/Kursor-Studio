import type { AssembledContext } from "./context/types";
import { CODING_AGENT_RULES, toolGuidance } from "./context/identity";
import type { ProjectContext } from "./types";

export { CODING_AGENT_RULES, toolGuidance };

export function buildSystemPrompt(
  context: AssembledContext | ProjectContext,
  toolsEnabled = true,
): string {
  if ("systemPrompt" in context && "slices" in context) {
    return context.systemPrompt;
  }
  const fileContent = context.currentFileContent
    ? `\nCurrent file content:\n\`\`\`\n${context.currentFileContent}\n\`\`\``
    : "";
  return `${CODING_AGENT_RULES}

Current project:
${context.projectName || "No project selected"}

Current file:
${context.currentFile ?? "No file open"}${fileContent}

${toolGuidance(toolsEnabled, Boolean(context.projectName))}`;
}
