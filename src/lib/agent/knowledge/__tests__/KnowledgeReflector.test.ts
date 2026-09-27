import { describe, expect, it } from "vitest";
import { AI_MODELS } from "../../config";
import { KnowledgeReflector } from "../KnowledgeReflector";
import { SPEC_AUTHOR_SYSTEM } from "../prompt";
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
    expect(events[1]).toMatchObject({ skillCount: 1, specCount: 1, proposalId: "kp-1" });
  });

  it("skips reflection while the plan is unfinished", async () => {
    const events: AgentEvent[] = [];
    const store = createMemoryKnowledgeProposalStore();
    let called = 0;
    let applied = 0;
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => {
          called += 1;
          return { text: '{"summary":"Nothing durable","skillActions":[],"specActions":[]}' };
        },
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
    expect(proposal).toBeNull();
    expect(called).toBe(0);
    expect(applied).toBe(0);
    expect(await store.get("kp-empty")).toBeNull();
    expect(events[0]).toMatchObject({
      type: "knowledge-reflect-skipped",
      reason: "not-implementation",
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
      kind: "architecture",
      fileName: "rajoute-une-page-pour-le-foot-aussi.md",
    });
    const content = proposal?.payload.specActions[0]?.content ?? "";
    expect(content).toContain("## Intention");
    expect(content).toContain("## Architecture");
    expect(content).toContain("## Structure");
    expect(content).toContain("src/pages/FootballExercisesPage.tsx");
    expect(content).not.toContain("Files touched");
    expect(proposal?.payload.skillActions).toEqual([]);
    expect(applied).toEqual(["kp-fallback"]);
    expect(events[1]).toMatchObject({
      type: "knowledge-reflect-completed",
      proposalId: "kp-fallback",
      skillCount: 0,
      specCount: 1,
    });
  });

  it("asks the spec author when the reflect result has no spec", async () => {
    const systems: string[] = [];
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async (_messages, options) => {
          systems.push(options.systemPrompt);
          if (systems.length === 1) {
            return { text: '{"summary":"Nothing durable","skillActions":[],"specActions":[]}' };
          }
          return {
            text: JSON.stringify({
              summary: "UI architecture",
              kind: "ui",
              fileName: "site-ui.md",
              title: "UI du site",
              content: [
                "# UI du site",
                "",
                "## Intention",
                "Le site présente les boissons et mène une commande sans friction.",
                "",
                "## Architecture",
                "App assemble DrinkCard, Cart et OrderForm autour de l'état de commande.",
                "",
                "## Structure",
                "Chaque composant de frontend/src/components porte une responsabilité visible.",
                "",
                "## Décisions",
                "Le style vit dans index.css pour garder une seule hiérarchie visuelle.",
                "",
                "## Fichiers",
                "- `frontend/src/App.tsx` — compose les vues.",
              ].join("\n"),
            }),
          };
        },
      },
      emit: () => undefined,
      store: createMemoryKnowledgeProposalStore(),
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      id: () => "kp-author",
    });
    const proposal = await reflector.run(input({
      goal: "améliore l'UI du site",
      filesChanged: ["frontend/src/App.tsx"],
    }));
    expect(systems[1]).toBe(SPEC_AUTHOR_SYSTEM);
    expect(proposal?.payload.specActions[0]).toMatchObject({
      action: "create",
      kind: "ui",
      fileName: "site-ui.md",
    });
    const content = proposal?.payload.specActions[0]?.content ?? "";
    expect(content).toContain("sans friction");
    expect(content).toContain("type: ui");
    expect(content).not.toContain("Files touched");
  });

  it("replaces a file-list spec with the authored architecture", async () => {
    let calls = 0;
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              text: JSON.stringify({
                summary: "thin",
                skillActions: [],
                specActions: [{
                  action: "create",
                  scope: "project",
                  fileName: "ui.md",
                  kind: "documentation",
                  content: "# améliore l'UI du site\n\nFiles touched:\n- frontend/src/App.tsx",
                }],
              }),
            };
          }
          return {
            text: JSON.stringify({
              kind: "ui",
              fileName: "ignored.md",
              content: [
                "# UI",
                "",
                "## Intention",
                "La commande reste le geste principal de l'interface.",
                "",
                "## Architecture",
                "Les cartes, le panier et le formulaire partagent un seul état.",
                "",
                "## Structure",
                "App.tsx compose les trois composants.",
                "",
                "## Décisions",
                "Aucun état de commande ne vit dans le CSS.",
              ].join("\n"),
            }),
          };
        },
      },
      emit: () => undefined,
      store: createMemoryKnowledgeProposalStore(),
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      id: () => "kp-thin",
    });
    const proposal = await reflector.run(input({
      goal: "améliore l'UI du site",
      filesChanged: ["frontend/src/App.tsx"],
    }));
    expect(calls).toBe(2);
    const content = proposal?.payload.specActions[0]?.content ?? "";
    expect(content).toContain("geste principal");
    expect(content).not.toContain("Files touched");
    expect(proposal?.payload.specActions[0]).toMatchObject({ fileName: "ui.md", kind: "ui" });
  });

  it("sends product excerpts and skips lockfiles and minified bundles", async () => {
    let prompt = "";
    const reflector = new KnowledgeReflector({
      ai: {
        streamChat: async () => ({ events: (async function* () {})() }),
        completeText: async (messages) => {
          prompt = messages[0]?.content ?? "";
          return {
            text: JSON.stringify({
              summary: "cart",
              skillActions: [],
              specActions: [{
                action: "create",
                scope: "project",
                fileName: "cart.md",
                kind: "ui",
                content: [
                  "# Cart",
                  "",
                  "## Intention",
                  "The cart holds the drinks the guest intends to order.",
                  "",
                  "## Architecture",
                  "Cart reads the shared order state and renders one row per drink.",
                  "",
                  "## Structure",
                  "Cart.tsx is the only module that lists selected drinks.",
                  "",
                  "## Decisions",
                  "Quantity changes stay in the order state, not in the card.",
                ].join("\n"),
              }],
            }),
          };
        },
      },
      emit: () => undefined,
      store: createMemoryKnowledgeProposalStore(),
      catalog: async () => [],
      getModels: () => ({ ordered: AI_MODELS }),
      readFile: async (path) => {
        if (path.endsWith("package-lock.json")) return "LOCKFILE_BODY";
        if (path.endsWith(".min.js")) return "MINIFIED_BODY";
        return "export function Cart() { return null }";
      },
    });
    await reflector.run(input({
      filesChanged: ["frontend/src/components/Cart.tsx", "package-lock.json", "frontend/dist/app.min.js"],
    }));
    expect(prompt).toContain("### frontend/src/components/Cart.tsx");
    expect(prompt).toContain("export function Cart() { return null }");
    expect(prompt).not.toContain("LOCKFILE_BODY");
    expect(prompt).not.toContain("MINIFIED_BODY");
    expect(prompt).not.toContain("### package-lock.json");
    expect(prompt).not.toContain("### frontend/dist/app.min.js");
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
