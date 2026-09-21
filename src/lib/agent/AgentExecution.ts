import type {
  AgentExecutionSnapshot,
  AgentMessage,
  AgentStatus,
  AgentStep,
  ToolCall,
  WorkStatus,
} from "./types";
import { createAgentStep, finishAgentStep, toolOutputOk } from "./AgentStep";

export interface AgentExecutionInit {
  requestId: string;
  messageId: string;
  userMessage: AgentMessage;
  baseMessages: readonly AgentMessage[];
}

export class AgentExecution {
  readonly requestId: string;
  readonly messageId: string;
  readonly userMessage: AgentMessage;
  readonly baseMessages: AgentMessage[];
  readonly startedAt = Date.now();
  readonly steps: AgentStep[] = [];
  readonly toolCalls: ToolCall[] = [];
  status: AgentStatus = "planning";

  constructor(init: AgentExecutionInit) {
    this.requestId = init.requestId;
    this.messageId = init.messageId;
    this.userMessage = init.userMessage;
    this.baseMessages = init.baseMessages.map((message) => ({ ...message }));
  }

  startModelStep(): AgentStep {
    const step = createAgentStep({ index: this.steps.length, kind: "model" });
    this.steps.push(step);
    return step;
  }

  startToolStep(id: string, tool: string, input: unknown): AgentStep {
    const existing = this.steps.find((step) => step.id === id);
    if (existing) return existing;
    const step = createAgentStep({ id, index: this.steps.length, kind: "tool", tool, input });
    this.steps.push(step);
    this.upsertTool({ id, tool, input, status: "running" });
    return step;
  }

  finishToolStep(id: string, tool: string, output: unknown): AgentStep | undefined {
    const failed = !toolOutputOk(output);
    const status: WorkStatus = failed ? "failed" : "completed";
    this.upsertTool({ id, tool, output, status });
    const index = this.steps.findIndex((step) => step.id === id && step.kind === "tool");
    if (index < 0) return undefined;
    const finished = finishAgentStep(this.steps[index]!, status, output);
    this.steps[index] = finished;
    return finished;
  }

  finishLatestModelStep(): AgentStep | undefined {
    for (let index = this.steps.length - 1; index >= 0; index -= 1) {
      const step = this.steps[index];
      if (step?.kind === "model" && step.status === "running") {
        const finished = finishAgentStep(step, "completed");
        this.steps[index] = finished;
        return finished;
      }
    }
    return undefined;
  }

  startVerifyStep(): AgentStep {
    const step = createAgentStep({ index: this.steps.length, kind: "verify" });
    this.steps.push(step);
    return step;
  }

  finishVerifyStep(ok: boolean): void {
    for (let index = this.steps.length - 1; index >= 0; index -= 1) {
      const step = this.steps[index];
      if (step?.kind === "verify" && step.status === "running") {
        this.steps[index] = finishAgentStep(step, ok ? "completed" : "failed");
        return;
      }
    }
  }

  snapshot(status: AgentStatus): AgentExecutionSnapshot {
    return {
      requestId: this.requestId,
      messageId: this.messageId,
      status,
      steps: this.steps.map((step) => ({ ...step })),
      toolCalls: this.toolCalls.map((call) => ({ ...call })),
    };
  }

  private upsertTool(partial: Pick<ToolCall, "id" | "tool"> & Partial<ToolCall>) {
    const existing = this.toolCalls.find((call) => call.id === partial.id);
    if (!existing) {
      this.toolCalls.push({
        id: partial.id,
        tool: partial.tool,
        input: partial.input ?? {},
        output: partial.output,
        status: partial.status ?? "running",
      });
      return;
    }
    existing.tool = partial.tool;
    if (partial.input !== undefined) existing.input = partial.input;
    if (partial.output !== undefined) existing.output = partial.output;
    if (partial.status) existing.status = partial.status;
  }
}
