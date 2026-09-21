import type { AgentExecution } from "./AgentExecution";
import { toolOutputOk } from "./AgentStep";
import type { AgentMessage, ToolCall } from "./types";

export function formatToolTranscript(toolCalls: readonly ToolCall[]): string {
  if (toolCalls.length === 0) return "";
  const lines = toolCalls.map((call) => {
    const input = safeJson(call.input);
    const output = call.output === undefined ? "(pending)" : safeJson(call.output);
    const failed = call.output !== undefined && !toolOutputOk(call.output);
    const name = failed ? `FAILED ${call.tool}` : call.tool;
    return `- ${name} ${input} -> ${output}`;
  });
  return `Tool results already produced this turn:\n${lines.join("\n")}`;
}

export class AgentExecutionContext {
  private readonly notes: string[] = [];

  constructor(private readonly execution: AgentExecution) {}

  addVerificationNote(text: string) {
    const trimmed = text.trim();
    if (trimmed) this.notes.push(trimmed);
  }

  messagesForModel(): AgentMessage[] {
    const recorded = this.execution.toolCalls.filter((call) => call.status !== "running");
    const messages = this.execution.baseMessages.map((message) => ({ ...message }));
    if (recorded.length > 0) {
      messages.push({
        id: `${this.execution.requestId}-tools`,
        role: "assistant",
        content: formatToolTranscript(recorded),
        timestamp: Date.now(),
      });
    }
    if (this.notes.length > 0) {
      messages.push({
        id: `${this.execution.requestId}-verify`,
        role: "system",
        content: this.notes.join("\n\n"),
        timestamp: Date.now(),
      });
    }
    return messages;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
