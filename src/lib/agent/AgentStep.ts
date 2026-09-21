import type { AgentStep, AgentStepKind, WorkStatus } from "./types";

export function createAgentStep(input: {
  index: number;
  kind: AgentStepKind;
  tool?: string;
  input?: unknown;
  id?: string;
}): AgentStep {
  return {
    id: input.id ?? crypto.randomUUID(),
    index: input.index,
    kind: input.kind,
    tool: input.tool,
    input: input.input,
    status: "running",
    startedAt: Date.now(),
  };
}

export function finishAgentStep(
  step: AgentStep,
  status: WorkStatus,
  output?: unknown,
): AgentStep {
  return {
    ...step,
    status,
    output: output === undefined ? step.output : output,
    finishedAt: Date.now(),
  };
}

export function isMutatingToolName(name: string, mutate?: boolean): boolean {
  if (mutate !== undefined) return mutate;
  return /^(write_|create_|delete_|edit_|apply_patch|run_command|start_process|kill_process)/.test(name);
}

export function isProcessToolName(name: string): boolean {
  return name === "run_command" || name === "start_process" || name === "kill_process";
}

export function toolOutputOk(output: unknown): boolean {
  if (!output || typeof output !== "object") return true;
  const record = output as { ok?: unknown; success?: unknown };
  if (record.success === false || record.ok === false) return false;
  return true;
}
