import type { AIService } from "./AIService";
import type { PermissionMode } from "./permissions/types";
import { PERMISSION_CLASSIFIER_SYSTEM } from "./workflow/prompts";

export interface PermissionClassifierInput {
  tool: string;
  args: unknown;
  cwd: string | null;
  mode: PermissionMode;
  model: string;
}

export type ClassifierDecision = "allow" | "deny" | "ask_human";

export function parseClassifierDecision(text: string): { decision: ClassifierDecision; reason?: string } {
  const trimmed = text.trim();
  try {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    const slice = jsonStart >= 0 && jsonEnd > jsonStart ? trimmed.slice(jsonStart, jsonEnd + 1) : trimmed;
    const parsed = JSON.parse(slice) as { decision?: unknown; reason?: unknown };
    if (parsed.decision === "allow" || parsed.decision === "deny" || parsed.decision === "ask_human") {
      return { decision: parsed.decision, reason: typeof parsed.reason === "string" ? parsed.reason : undefined };
    }
  } catch {
    /* fall through */
  }
  const lower = trimmed.toLowerCase();
  if (/\bdeny\b/.test(lower)) return { decision: "deny", reason: trimmed.slice(0, 200) };
  if (/\ballow\b/.test(lower)) return { decision: "allow", reason: trimmed.slice(0, 200) };
  return { decision: "ask_human", reason: "Unparseable classifier output." };
}

export async function classifyPermission(
  ai: AIService,
  input: PermissionClassifierInput,
  signal?: AbortSignal,
): Promise<{ decision: ClassifierDecision; reason?: string }> {
  if (!ai.completeText) return { decision: "ask_human", reason: "No completeText on AIService." };
  try {
    const result = await ai.completeText(
      [{
        id: crypto.randomUUID(),
        role: "user",
        content: JSON.stringify({
          tool: input.tool,
          args: input.args,
          cwd: input.cwd,
          mode: input.mode,
        }),
        timestamp: Date.now(),
      }],
      {
        model: input.model,
        systemPrompt: PERMISSION_CLASSIFIER_SYSTEM,
        signal,
        json: true,
      },
    );
    return parseClassifierDecision(result.text);
  } catch (error) {
    return {
      decision: "ask_human",
      reason: error instanceof Error ? error.message : "Classifier failed.",
    };
  }
}
