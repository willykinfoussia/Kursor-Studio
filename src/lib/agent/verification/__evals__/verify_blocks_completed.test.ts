import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../../AgentRuntime";
import { AI_MODELS } from "../../config";
import { UsageMetrics } from "../../metrics";
import { VerificationEngine } from "../VerificationEngine";
import type { AIService } from "../../AIService";
import type { AgentEvent, AgentStream } from "../../types";
import type { CheckRunner } from "../types";

function mutateThenText(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "tool-started", id: "t1", tool: "write_file", input: { path: "src/app.ts", content: "x" } };
      yield { type: "tool-completed", id: "t1", tool: "write_file", output: { ok: true, path: "src/app.ts" } };
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function emptyStream(): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {})(),
  };
}

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function createRuntime(aiService: AIService, checkRunner: CheckRunner) {
  const runtime = new AgentRuntime({
    aiService,
    metrics: new UsageMetrics(),
    verification: new VerificationEngine({ profile: { test: "pnpm test" } }),
    checkRunner,
    getSettings: () => ({
      defaultModel: AI_MODELS[0].id,
      fallbackEnabled: false,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
    }),
  });
  runtime.workflowSession.skipProcess = true;
  runtime.workflowSession.approvePlan();
  runtime.workflowSession.setPlanTodosComplete(true);
  runtime.workflowSession.markSkillCheck("verification-before-completion");
  return runtime;
}

describe("verification evals", () => {
  it("verify_blocks_completed_without_evidence", async () => {
    const service: AIService = {
      async streamChat() {
        return mutateThenText("I think the tests pass.");
      },
    };
    const runtime = createRuntime(service, {
      async run() {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "src/app.ts(1,1): error TS2322: Type 'number' is not assignable.",
        };
      },
    });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("fix the types");

    const completed = events.filter((event) => event.type === "verification-completed");
    expect(completed.length).toBe(3);
    expect(completed.every((event) => event.type === "verification-completed" && event.ok === false)).toBe(true);
    expect(events.some((event) => event.type === "completed")).toBe(false);
    expect(runtime.getState().status).toBe("failed");
  });

  it("verify_repair_then_complete", async () => {
    let verifies = 0;
    let turns = 0;
    const service: AIService = {
      async streamChat() {
        turns += 1;
        if (turns === 1) return mutateThenText("Wrote the file.");
        return textStream("Fixed the type error.");
      },
    };
    const runtime = createRuntime(service, {
      async run() {
        verifies += 1;
        if (verifies === 1) {
          return { exitCode: 1, stdout: "", stderr: "src/app.ts(1,1): error TS2322" };
        }
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
    });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("fix the types");

    const verified = events.filter((event) => event.type === "verification-completed");
    expect(verified.map((event) => event.type === "verification-completed" ? event.ok : null)).toEqual([false, true]);
    expect(events.some((event) => event.type === "completed")).toBe(true);
    expect(runtime.getState().status).toBe("completed");
    expect(turns).toBe(2);
  });

  it("keeps the verification diagnosis when the repair turn is empty", async () => {
    let turns = 0;
    const service: AIService = {
      async streamChat() {
        turns += 1;
        if (turns === 1) return mutateThenText("Wrote the file.");
        return emptyStream();
      },
    };
    const runtime = createRuntime(service, {
      async run() {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "src/app.ts(1,1): error TS2322: Type 'number' is not assignable.",
        };
      },
    });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("fix the types");

    const errors = events.filter((event) => event.type === "error");
    expect(errors.some((event) => event.type === "error" && /empty response/i.test(event.message))).toBe(false);
    expect(errors.some((event) => event.type === "error" && /TS2322|Required checks failed/i.test(event.message))).toBe(true);
    expect(events.some((event) => event.type === "completed")).toBe(false);
    expect(runtime.getState().status).toBe("failed");
    expect(events.some((event) => event.type === "verification-completed" && event.ok === false)).toBe(true);
  });
});
