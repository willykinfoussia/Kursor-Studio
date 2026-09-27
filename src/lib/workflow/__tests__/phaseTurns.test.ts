import { describe, expect, it } from "vitest";
import { collectPhaseTurns } from "../phaseTurns";
import { PIPELINE_IDS } from "../pipelineSchema";
import type { AgentRunEvent } from "../events";
import type { AgentEvent } from "../../agent/types";

function event(sequence: number, payload: AgentEvent): AgentRunEvent {
  return { id: `e${sequence}`, runId: "run-1", timestamp: sequence, sequence, type: payload.type, payload };
}

describe("collectPhaseTurns", () => {
  it("splits brainstorm explore turns from the parent implementation turn", () => {
    const turns = collectPhaseTurns([
      event(1, { type: "task-started", taskId: "t1", title: "Ajoute un compte" }),
      event(2, { type: "skill-loaded", skillId: "brainstorming", name: "Brainstorming" }),
      event(3, { type: "agent-started", runId: "run-1", agentId: "explore", name: "Explore", taskId: "a1" }),
      event(4, { type: "step-started", stepId: "e1", index: 0, kind: "model", agentId: "explore" }),
      event(5, { type: "assistant-message", messageId: "m", text: "Found the seed.", agentId: "explore" }),
      event(6, { type: "tool-completed", id: "r1", tool: "read_file", output: "drinks", agentId: "explore" }),
      event(7, { type: "step-started", stepId: "e2", index: 1, kind: "model", agentId: "explore" }),
      event(8, { type: "assistant-message", messageId: "m", text: "No images.", agentId: "explore" }),
      event(9, { type: "subagent-task-completed", taskId: "a1", agentId: "explore" }),
      event(10, { type: "skill-loaded", skillId: "executing-plans", name: "Executing" }),
      event(11, { type: "started", requestId: "run-1", messageId: "m2", model: "laguna", userMessage: { id: "u", role: "user", content: "Build the approved plan \"Boisson\" at plan.md.", timestamp: 1 } }),
      event(12, { type: "step-started", stepId: "p1", index: 0, kind: "model" }),
      event(13, { type: "assistant-message", messageId: "m2", text: "Implementing." }),
    ]);
    const brainstorm = turns.get(PIPELINE_IDS.brainstorming) ?? [];
    const implementation = turns.get(PIPELINE_IDS.executingPlans) ?? [];
    expect(brainstorm).toHaveLength(2);
    expect(brainstorm[0]?.input).toBe("Ajoute un compte");
    expect(brainstorm[0]?.output).toBe("Found the seed.");
    expect(brainstorm[0]?.tools).toEqual(["read_file"]);
    expect(brainstorm[1]?.input).toContain("read_file");
    expect(brainstorm[1]?.output).toBe("No images.");
    expect(implementation[0]?.input).toContain("Build the approved plan");
    expect(implementation[0]?.output).toBe("Implementing.");
  });
});
