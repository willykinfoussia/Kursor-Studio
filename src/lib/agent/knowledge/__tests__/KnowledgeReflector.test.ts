import { describe, expect, it } from "vitest";
import { AI_MODELS } from "../../config";
import { KnowledgeReflector } from "../KnowledgeReflector";
import { createMemoryKnowledgeProposalStore } from "../KnowledgeProposalStore";
import type { KnowledgeReflectInput } from "../types";
import type { AgentEvent } from "../../types";

const longGoal = "Implement JWT auth with refresh token rotation";

function input(partial: Partial<KnowledgeReflectInput> = {}): KnowledgeReflectInput {
  return {
    runId: "run-1",
    projectId: "p1",
    conversationId: "c1",
    goal: longGoal,
    messages: [
      { role: "user", content: longGoal },
      { role: "assistant", content: "Added refresh rotation and documented it." },
    ],
    toolNames: ["write_file"],
    filesChanged: ["src/auth.ts"],
    ...partial,
  };
}

describe("KnowledgeReflector", () => {
  it("skips when there is no completeText", async () => {
    const events: AgentEvent[] = [];
    const reflector = new KnowledgeReflector({
      emit: (event) => events.push(event),
      store: createMemoryKnowledgeProposalStore(),
    });
    const result = await reflector.run(input());
    expect(result).toBeNull();
    expect(events).toEqual([{ type: "knowledge-reflect-skipped", runId: "run-1", reason: "no-llm" }]);
  });

  it("skips when there is no project", async () => {
    const events: AgentEvent[] = [];
    const reflector = new KnowledgeReflector({
      ai: { streamChat: async () => ({ events: (async function* () {})() }), completeText: async () => ({ text: "{}" }) },
      emit: (event) => events.push(event),
      store: createMemoryKnowledgeProposalStore(),
    });
    await reflector.run(input({ projectId: null }));
    expect(events[0]).toMatchObject({ type: "knowledge-reflect-skipped", reason: "no-project" });
  });

  it("skips plan-only runs before calling the model", async () => {
    const events: AgentEvent[] = [];
    let called = 0;
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => {
          called += 1;
          return { text: "{}" };
        },
      },
      emit: (event) => events.push(event),
      store: createMemoryKnowledgeProposalStore(),
      getModels: () => ({ ordered: AI_MODELS }),
    });
    await reflector.run(input({
      toolNames: ["create_plan"],
      filesChanged: [".kursor/plans/demo.plan.md"],
    }));
    expect(called).toBe(0);
    expect(events[0]).toMatchObject({ type: "knowledge-reflect-skipped", reason: "not-implementation" });
  });

  it("applies proposals automatically when the model returns actions", async () => {
    const events: AgentEvent[] = [];
    const store = createMemoryKnowledgeProposalStore();
    const applied: string[] = [];
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => ({
          text: JSON.stringify({
            summary: "Capture JWT procedure",
            skillActions: [{
              action: "create",
              skillId: "jwt-refresh",
              scope: "project",
              rationale: "Reusable auth procedure",
              draft: { name: "JWT refresh", description: "Use when adding auth", instructions: "Rotate refresh tokens." },
            }],
            specActions: [],
          }),
        }),
      },
      emit: (event) => events.push(event),
      store,
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      id: () => "kp-1",
      now: () => 42,
      applyProposal: async (proposal) => {
        applied.push(proposal.id);
      },
    });
    const proposal = await reflector.run(input());
    expect(proposal?.id).toBe("kp-1");
    expect(proposal?.status).toBe("applied");
    expect(applied).toEqual(["kp-1"]);
    expect(await store.get("kp-1")).toMatchObject({ summary: "Capture JWT procedure", status: "applied" });
    expect(events.map((event) => event.type)).toEqual([
      "knowledge-reflect-started",
      "knowledge-reflect-completed",
    ]);
    expect(events[1]).toMatchObject({ skillCount: 1, specCount: 0, proposalId: "kp-1" });
  });

  it("completes without applying when the model returns empty arrays mid-plan", async () => {
    const events: AgentEvent[] = [];
    const store = createMemoryKnowledgeProposalStore();
    let applied = 0;
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => ({ text: '{"summary":"Nothing durable","skillActions":[],"specActions":[]}' }),
      },
      emit: (event) => events.push(event),
      store,
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      id: () => "kp-empty",
      applyProposal: async () => {
        applied += 1;
      },
    });
    const proposal = await reflector.run(input({ planUnfinished: true }));
    expect(proposal?.id).toBe("kp-empty");
    expect(proposal?.status).toBe("applied");
    expect(proposal?.payload.skillActions).toEqual([]);
    expect(proposal?.payload.specActions).toEqual([]);
    expect(applied).toBe(0);
    expect(await store.get("kp-empty")).toBeTruthy();
    expect(events[1]).toMatchObject({
      type: "knowledge-reflect-completed",
      proposalId: "kp-empty",
      skillCount: 0,
      specCount: 0,
    });
  });

  it("falls back to one project spec when implementation produced no spec actions", async () => {
    const events: AgentEvent[] = [];
    const store = createMemoryKnowledgeProposalStore();
    const applied: string[] = [];
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => ({ text: '{"summary":"Nothing durable","skillActions":[],"specActions":[]}' }),
      },
      emit: (event) => events.push(event),
      store,
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      id: () => "kp-fallback",
      applyProposal: async (proposal) => {
        applied.push(proposal.id);
      },
    });
    const proposal = await reflector.run(input({
      goal: "rajoute une page pour le foot aussi",
      filesChanged: ["src/pages/FootballExercisesPage.tsx"],
    }));
    expect(proposal?.payload.specActions).toHaveLength(1);
    expect(proposal?.payload.specActions[0]).toMatchObject({
      action: "create",
      kind: "documentation",
      fileName: "rajoute-une-page-pour-le-foot-aussi.md",
    });
    expect(proposal?.payload.skillActions).toEqual([]);
    expect(applied).toEqual(["kp-fallback"]);
    expect(events[1]).toMatchObject({
      type: "knowledge-reflect-completed",
      proposalId: "kp-fallback",
      skillCount: 0,
      specCount: 1,
    });
  });

  it("retries the next model then emits the real error", async () => {
    const events: AgentEvent[] = [];
    const models = [
      { id: "first", name: "First", priority: 1, enabled: true },
      { id: "second", name: "Second", priority: 2, enabled: true },
    ];
    const tried: string[] = [];
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async (_messages, options) => {
          tried.push(options.model);
          throw new Error(`gateway ${options.model}`);
        },
      },
      emit: (event) => events.push(event),
      store: createMemoryKnowledgeProposalStore(),
      catalog: async () => [],
      getModels: () => ({ ordered: models }),
    });
    await reflector.run(input());
    expect(tried.length).toBeGreaterThan(1);
    expect(events.at(-1)).toMatchObject({
      type: "knowledge-reflect-skipped",
      reason: "failed",
    });
    expect((events.at(-1) as { error?: string }).error).toMatch(/gateway/);
  });
});
