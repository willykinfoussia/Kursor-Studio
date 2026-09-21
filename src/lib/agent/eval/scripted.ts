import type { AIService } from "../AIService";
import type { AgentMessage, AgentStream, AIRequestOptions } from "../types";
import type { ScriptedTurn } from "./types";

export class ScriptedAIService implements AIService {
  private callIndex = 0;

  constructor(private readonly script: readonly ScriptedTurn[]) {}

  async streamChat(_messages: AgentMessage[], options: AIRequestOptions): Promise<AgentStream> {
    const turn = this.script[this.callIndex] ?? { text: "Done." };
    this.callIndex += 1;
    return {
      events: playTurn(turn, options),
    };
  }
}

async function* playTurn(turn: ScriptedTurn, options: AIRequestOptions): AsyncGenerator<import("../types").AgentEvent> {
  for (const call of turn.tools ?? []) {
    const id = crypto.randomUUID();
    yield { type: "tool-started", id, tool: call.name, input: call.input };
    if (call.hang) {
      await waitAbort(options.signal);
      return;
    }
    if (!options.executor) continue;
    const output = await options.executor.run(call.name, call.input, {
      signal: options.signal,
      callId: id,
    });
    yield { type: "tool-completed", id, tool: call.name, output };
  }
  if (turn.text) {
    yield { type: "text-delta", messageId: "", text: turn.text };
  }
}

function waitAbort(signal?: AbortSignal) {
  return new Promise<void>((_resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (!signal) return;
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
