import { CONTEXT_PRIORITIES, type ContextSource, type SourceCollectResult } from "../types";
import { estimateTokens } from "../tokens";

export class ToolSource implements ContextSource {
  readonly id = "tool" as const;

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    const recorded = snapshot.toolCalls.filter((call) => (
      call.status !== "running"
      && call.tool !== "web_search"
      && call.tool !== "fetch_url"
    ));
    if (recorded.length === 0) {
      return { slices: [], skipReason: "no tool results" };
    }

    const slices = recorded.map((call, index) => {
      const input = safeJson(call.input);
      const output = call.output === undefined ? "(pending)" : safeJson(call.output);
      const text = `${call.tool} ${input} -> ${output}`;
      return {
        id: `tool:${index}:${call.id}`,
        source: this.id,
        priority: CONTEXT_PRIORITIES.toolResults,
        score: 0.5,
        tokens: estimateTokens(text),
        text,
        meta: {
          tool: call.tool,
          callId: call.id,
          index: String(index),
        },
      };
    });

    return { slices };
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
