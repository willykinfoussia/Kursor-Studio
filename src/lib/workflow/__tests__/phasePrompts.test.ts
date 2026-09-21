import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../agent/types";
import type { AgentRunEvent } from "../events";
import { extractPhasePrompts } from "../phasePrompts";
import { PIPELINE_IDS } from "../pipelineSchema";

function event(sequence: number, payload: AgentEvent, runId = "run-1"): AgentRunEvent {
  return {
    id: `e${sequence}`,
    runId,
    timestamp: sequence * 1000,
    sequence,
    type: payload.type,
    payload,
  };
}

describe("extractPhasePrompts", () => {
  it("maps brainstorming first user prompt and last agent text", () => {
    const prompts = extractPhasePrompts([
      event(1, {
        type: "started",
        requestId: "run-1",
        messageId: "m1",
        model: "laguna",
        userMessage: { id: "u1", role: "user", content: "Build a todo app", timestamp: 1 },
      }),
      event(2, { type: "skill-loaded", skillId: "brainstorming", name: "Brainstorming" }),
      event(3, {
        type: "assistant-message",
        messageId: "m1",
        text: "Here is a design for a simple todo list.",
      }),
      event(4, {
        type: "user-question",
        id: "q1",
        prompt: "Does this design look good?",
        options: ["yes", "no"],
      }),
      event(5, { type: "design-gate", reason: "approved", tool: "ask_user_question" }),
    ]);

    const brainstorm = prompts.get(PIPELINE_IDS.brainstorming);
    expect(brainstorm?.inputPrompt).toBe("Build a todo app");
    expect(brainstorm?.inputRole).toBe("user");
    expect(brainstorm?.outputPrompt).toBe("Does this design look good?");
    expect(brainstorm?.outputRole).toBe("agent");

    const gate = prompts.get(PIPELINE_IDS.designGate);
    expect(gate?.inputPrompt).toBe("Does this design look good?");
    expect(gate?.outputPrompt).toBe("approved via ask_user_question");
  });

  it("uses assistant-message as brainstorm output when no user-question follows", () => {
    const prompts = extractPhasePrompts([
      event(1, {
        type: "started",
        requestId: "run-1",
        messageId: "m1",
        model: "laguna",
        userMessage: { id: "u1", role: "user", content: "Add auth", timestamp: 1 },
      }),
      event(2, { type: "skill-loaded", skillId: "brainstorming", name: "Brainstorming" }),
      event(3, {
        type: "assistant-message",
        messageId: "m1",
        text: "Proposed OAuth flow.",
      }),
      event(4, { type: "design-gate", reason: "approved", tool: "chat" }),
    ]);

    expect(prompts.get(PIPELINE_IDS.brainstorming)?.outputPrompt).toBe("Proposed OAuth flow.");
    expect(prompts.get(PIPELINE_IDS.designGate)?.outputPrompt).toBe("Add auth");
    expect(prompts.get(PIPELINE_IDS.designGate)?.outputRole).toBe("user");
  });

  it("attaches tool input and output", () => {
    const prompts = extractPhasePrompts([
      event(1, {
        type: "started",
        requestId: "run-1",
        messageId: "m1",
        model: "laguna",
        userMessage: { id: "u1", role: "user", content: "Read file", timestamp: 1 },
      }),
      event(2, {
        type: "tool-started",
        id: "t1",
        tool: "read_file",
        input: { path: "src/App.tsx" },
      }),
      event(3, {
        type: "tool-completed",
        id: "t1",
        tool: "read_file",
        output: { ok: true, content: "export function App() {}" },
      }),
    ]);

    const tool = prompts.get(PIPELINE_IDS.tool("t1"));
    expect(tool?.inputPrompt).toContain("src/App.tsx");
    expect(tool?.outputPrompt).toContain("export function App");
  });

  it("handles runs without assistant-message", () => {
    const prompts = extractPhasePrompts([
      event(1, {
        type: "started",
        requestId: "run-1",
        messageId: "m1",
        model: "laguna",
        userMessage: { id: "u1", role: "user", content: "Explain App.tsx", timestamp: 1 },
      }),
      event(2, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);

    expect(prompts.get(PIPELINE_IDS.user)?.outputPrompt).toBe("Explain App.tsx");
    expect(prompts.get(PIPELINE_IDS.result)?.inputPrompt).toBe("Explain App.tsx");
    expect(prompts.get(PIPELINE_IDS.result)?.outputPrompt).toBeUndefined();
  });
});
