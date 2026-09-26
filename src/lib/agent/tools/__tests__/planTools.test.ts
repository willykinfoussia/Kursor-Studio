import { beforeEach, describe, expect, it } from "vitest";
import { WorkflowSessionState } from "../../workflow/sessionState";
import {
  applyTodoStatuses,
  createCreatePlanTool,
  createUpdatePlanTodoTool,
  designNotesInvalidReason,
  MIN_PLAN_BODY_CHARS,
  planBodyInvalidReason,
  proseLengthWithoutMermaid,
  resolvePlanDiskPath,
} from "../planTools";
import { idleToolContext } from "../result";
import type { AgentEvent } from "../../types";
import { usePlanStore } from "../../../../stores/planStore";
import { createPlanDocument, parsePlanFile } from "../../plans/planFile";

function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      createDirectory: async () => undefined,
      writeFile: async (path: string, content: string) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        files.set(path, content);
      },
      readFile: async (path: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const content = files.get(path);
        if (content === undefined) throw new Error(`Missing file ${path}`);
        return content;
      },
    } as never,
  };
}

function context() {
  const session = new WorkflowSessionState();
  const events: AgentEvent[] = [];
  const harness = { workflow: session } as never;
  const skillSession = { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never;
  return { session, events, ctx: idleToolContext("C:/Projects/TodoApp", { harness, skillSession }) };
}

function mermaidBlock() {
  return ["```mermaid", "flowchart TD", "  ui[Swipe UI] --> api[Match API]", "  api --> db[(Profiles)]", "```"].join("\n");
}

function padToMin(body: string): string {
  const sentence = "The matcher stores profiles locally, exposes scoreMatch(a, b), and never calls a remote API. ";
  let result = body;
  while (proseLengthWithoutMermaid(result) < MIN_PLAN_BODY_CHARS) {
    result += `\n\n${sentence.repeat(20)}`;
  }
  return result;
}

function richPlanBody(todos: string[] = ["Do A", "Do B"]) {
  const sections = todos.map((todo, index) => [
    `## ${index + 1}. ${todo}`,
    `Create or modify the files for ${todo} so the feature can ship without guessing names.`,
    "**Files:**",
    `- Create: \`src/lib/task-${index + 1}.ts\``,
    "```ts",
    `export function step${index + 1}() { return "${todo}"; }`,
    "```",
    "**Test:** run `pnpm test` and confirm this todo's behavior.",
  ].join("\n"));
  return padToMin([
    "# Feature Implementation Plan",
    "**Objective:** Ship the agreed design with named files and verifiable steps.",
    "## Problem",
    "Scoring is guessed in the UI. Success: local scoreMatch with no remote API.",
    "## Architecture",
    "Keep UI thin; put scoring in a local module; persist nothing remotely.",
    mermaidBlock(),
    "## Architecture impact",
    "| Component | Action | Reason |",
    "|---|---|---|",
    "| AIService | KEEP | Single LLM interface; do not add a second client. |",
    "| AgentLoop | EXTEND | Overlay and plan todos stay in the existing loop. |",
    "## File map",
    "- Create: `src/lib/match.ts` — scoring",
    "- Modify: `src/App.tsx` — route the new page",
    ...sections,
  ].join("\n\n"));
}

function longCodePlanWithoutStrategy(todos: string[] = ["Do A", "Do B"]) {
  const sections = todos.map((todo, index) => [
    `## ${index + 1}. ${todo}`,
    `Create or modify the files for ${todo} so the feature can ship without guessing names.`,
    "**Files:**",
    `- Create: \`src/lib/task-${index + 1}.ts\``,
    "```ts",
    `export function step${index + 1}() { return "${todo}"; }`,
    "```",
    "**Test:** run `pnpm test` and confirm this todo's behavior.",
  ].join("\n"));
  return padToMin([
    "# Feature Implementation Plan",
    "**Goal:** Ship the agreed design with named files and verifiable steps.",
    "**Architecture:** Keep UI thin; put scoring in a local module; persist nothing remotely.",
    mermaidBlock(),
    "## File map",
    "- Create: `src/lib/match.ts` — scoring",
    "- Modify: `src/App.tsx` — route the new page",
    ...sections,
  ].join("\n\n"));
}

function taxiOutlineBody() {
  const mermaid = ["```mermaid", "flowchart TD", "  A[App] --> B[Home]", "```"].join("\n");
  const flow = ["```mermaid", "sequenceDiagram", "  User->>App: book", "```"].join("\n");
  return [
    "## Architecture",
    mermaid,
    "## Data Flow",
    flow,
    "## File Map",
    "| Fichier | Rôle |",
    "|---------|------|",
    "| `src/App.tsx` | Router |",
    "| `src/store/useRideStore.ts` | Zustand |",
    "## Tasks",
    "1. **Init projet Vite + React TS + Tailwind** — npm create vite",
    "2. **Configurer Tailwind CSS** — tailwind.config.ts",
    "3. **Créer types.ts, price.ts, demo.ts** — libs",
    "4. **Créer le store Zustand useRideStore** — addRide",
    "5. **Créer composants BookingForm + RideCard** — UI",
    "6. **Créer pages HomePage + BookingPage + RideListPage** — pages",
    "7. **Assembler router dans App.tsx** — nav",
    "8. **Tester le fonctionnement** — build",
  ].join("\n\n");
}

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("plan tools", () => {
  it("rejects a short body or a body without mermaid", () => {
    expect(planBodyInvalidReason("")).toMatch(/required/i);
    expect(planBodyInvalidReason("# Demo")).toMatch(/mermaid/i);
    expect(planBodyInvalidReason("x".repeat(MIN_PLAN_BODY_CHARS))).toMatch(/mermaid/i);
    expect(planBodyInvalidReason(richPlanBody(), ["Do A", "Do B"])).toBeNull();
  });

  it("accepts a todo whose heading is the text before a parenthetical package list", () => {
    const heading = "Initialize Expo project with TypeScript and install dependencies";
    const todo = `${heading} (expo-av, expo-haptics, @react-navigation stack, async-storage, date-fns)`;
    expect(planBodyInvalidReason(richPlanBody([heading]), [todo])).toBeNull();
  });

  it("accepts a short heading when the todo adds a parenthetical", () => {
    expect(planBodyInvalidReason(
      richPlanBody(["Final verification"]),
      ["Final verification (tsc, dev server, all routes)"],
    )).toBeNull();
    expect(planBodyInvalidReason(
      richPlanBody(["Create localStorage and data hooks"]),
      ["Create localStorage and data hooks (useLocalStorage, useExercises, useWorkouts)"],
    )).toBeNull();
  });

  it("accepts a heading that covers the todo words in a different order", () => {
    expect(planBodyInvalidReason(
      richPlanBody(["Create index re-export for hooks"]),
      ["Create hooks index re-export"],
    )).toBeNull();
  });

  it("lists every missing todo and the expected heading", () => {
    const reason = planBodyInvalidReason(
      richPlanBody(["Do A"]),
      ["Do A", "Ship the dashboard", "Wire routing"],
    );
    expect(reason).toMatch(/Ship the dashboard/);
    expect(reason).toMatch(/Wire routing/);
    expect(reason).toMatch(/## 2\. Ship the dashboard/);
    expect(reason).toMatch(/## 3\. Wire routing/);
    expect(reason).not.toMatch(/missing "Do A"/);
  });

  it("still rejects a body that never mentions a todo", () => {
    expect(planBodyInvalidReason(richPlanBody(["Do A", "Do B"]), ["Totally missing task"])).toMatch(/missing/i);
  });

  it("rejects outline-only Taxi-like bodies", () => {
    const reason = planBodyInvalidReason(taxiOutlineBody(), [
      "Init projet Vite + React TS + Tailwind",
      "Configurer Tailwind CSS",
    ]);
    expect(reason).toBeTruthy();
  });

  it("rejects a long body that still omits Problem and KEEP/EXTEND", () => {
    const reason = planBodyInvalidReason(longCodePlanWithoutStrategy(), ["Do A", "Do B"]);
    expect(reason).toMatch(/Problem|KEEP|EXTEND/i);
    expect(planBodyInvalidReason(richPlanBody(), ["Do A", "Do B"])).toBeNull();
  });

  it("accepts French Problem and Conserver/Étendre impact labels", () => {
    const body = richPlanBody()
      .replace("## Problem", "## Problème")
      .replace("| AIService | KEEP |", "| AIService | Conserver |")
      .replace("| AgentLoop | EXTEND |", "| AgentLoop | Étendre |");
    expect(planBodyInvalidReason(body, ["Do A", "Do B"])).toBeNull();
  });

  it("rejects numbered todos that omit how to verify", () => {
    const body = richPlanBody().replace(/\*\*Test:\*\*/g, "**Notes:**");
    expect(planBodyInvalidReason(body, ["Do A", "Do B"])).toMatch(/Test, Verification, Done when/i);
  });

  it("ignores numbered strategy headings when each todo section has a Verification heading", () => {
    const body = richPlanBody()
      .replace("## Problem", "## 1. Problem")
      .replace("## Architecture", "## 2. Architecture")
      .replace(/\*\*Test:\*\*[^\n]*/g, "### Verification\nConfirm the todo behavior.");
    expect(planBodyInvalidReason(body, ["Do A", "Do B"])).toBeNull();
  });

  it("accepts a verification label whose colon sits outside the bold markers", () => {
    const body = richPlanBody().replace(/\*\*Test:\*\*/g, "**Verification**:");
    expect(planBodyInvalidReason(body, ["Do A", "Do B"])).toBeNull();
  });

  it("rejects a create_plan body that omits approved design notes", async () => {
    const { fs } = memoryFs();
    const { session, ctx } = context();
    session.designNotes = ["Workout Tracker", "React + TypeScript + Tailwind + localStorage"];
    expect(designNotesInvalidReason("Next.js 14 with Prisma", richPlanBody(), session.designNotes)).toMatch(/localStorage/);
    const tool = createCreatePlanTool({ fs });
    const result = await tool.execute(
      {
        name: "Fitness",
        overview: "Next.js 14 App Router with Prisma and NextAuth",
        body: richPlanBody(),
        todos: ["Do A", "Do B"],
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/localStorage/);
  });

  it("accepts a create_plan body that covers approved design notes", async () => {
    const { fs } = memoryFs();
    const { session, ctx } = context();
    session.designNotes = ["Workout Tracker", "React + TypeScript + Tailwind + localStorage"];
    const body = `${richPlanBody()}\nPersist the Workout Tracker with React, TypeScript, Tailwind, and localStorage.`;
    const tool = createCreatePlanTool({ fs });
    const result = await tool.execute(
      {
        name: "Fitness",
        overview: "Client-only Workout Tracker with React TypeScript Tailwind and localStorage",
        body,
        todos: ["Do A", "Do B"],
      },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it("create_plan writes a .plan.md file and emits plan-created without approving", async () => {
    const { files, fs } = memoryFs();
    const { session, events, ctx } = context();
    const tool = createCreatePlanTool({ fs });
    const body = richPlanBody();
    const result = await tool.execute(
      { name: "Demo", overview: "Ship it", body, todos: ["Do A", "Do B"] },
      ctx,
    );
    expect(result.success).toBe(true);
    const path = (result.data as { path: string }).path;
    expect(path).toMatch(/^\.kursor\/plans\//);
    expect(files.get(path)).toContain("Do A");
    expect(files.get(path)).toContain("```mermaid");
    expect(session.planPath).toBe(path);
    expect(session.planApproved).toBe(false);
    expect(session.invokedSkillIds).not.toContain("writing-plans");
    expect(events.some((event) => event.type === "plan-created")).toBe(true);
    expect(events.some((event) => event.type === "plan-written")).toBe(true);
  });

  it("create_plan activates the new plan and drafts other approved plans", async () => {
    const { fs } = memoryFs();
    const { ctx } = context();
    const old = createPlanDocument({ name: "Old Next", overview: "", body: "", todos: ["a"] });
    old.status = "approved";
    usePlanStore.setState({ plans: { [old.id]: old }, activePlanId: old.id });
    const tool = createCreatePlanTool({ fs });
    const result = await tool.execute(
      { name: "Local SPA", overview: "Ship it", body: richPlanBody(), todos: ["Do A", "Do B"] },
      ctx,
    );
    expect(result.success).toBe(true);
    const planId = (result.data as { planId: string }).planId;
    const state = usePlanStore.getState();
    expect(state.activePlanId).toBe(planId);
    expect(state.plans[old.id]?.status).toBe("draft");
    expect(state.plans[planId]?.status).toBe("draft");
  });

  it("create_plan requires a name, todos, a long body, and mermaid", async () => {
    const { fs } = memoryFs();
    const { ctx } = context();
    const tool = createCreatePlanTool({ fs });
    expect((await tool.execute({ name: "", todos: ["a"], body: richPlanBody(["a"]) }, ctx)).success).toBe(false);
    expect((await tool.execute({ name: "x", todos: [], body: richPlanBody() }, ctx)).success).toBe(false);
    const short = await tool.execute({ name: "x", todos: ["a"], body: "# Demo" }, ctx);
    expect(short.success).toBe(false);
    expect(short.error?.code).toBe("invalid_input");
    const noMermaid = await tool.execute({ name: "x", todos: ["a"], body: "n".repeat(MIN_PLAN_BODY_CHARS) }, ctx);
    expect(noMermaid.success).toBe(false);
    expect(noMermaid.error?.message).toMatch(/mermaid/i);
    const outline = await tool.execute(
      { name: "Taxi", todos: ["Init projet Vite + React TS + Tailwind", "Configurer Tailwind CSS"], body: taxiOutlineBody() },
      ctx,
    );
    expect(outline.success).toBe(false);
  });

  it("update_plan_todo flips a todo, tracks the active todo, and emits plan-completed when done", async () => {
    const { fs } = memoryFs();
    const { session, events, ctx } = context();
    const created = await createCreatePlanTool({ fs }).execute(
      { name: "Demo", overview: "", body: richPlanBody(), todos: ["Do A", "Do B"] },
      ctx,
    );
    expect(created.success).toBe(true);
    const tool = createUpdatePlanTodoTool({ fs });
    const start = await tool.execute({ todo_id: "todo-1", status: "in_progress" }, ctx);
    expect(start.success).toBe(true);
    expect(session.activeTodoId).toBe("todo-1");
    const first = await tool.execute({ todo_id: "todo-1", status: "completed" }, ctx);
    expect(first.success).toBe(true);
    expect(first.data).toMatchObject({ done: 1, total: 2 });
    expect(session.activeTodoId).toBeNull();
    expect(session.planTodosComplete).toBe(false);
    const second = await tool.execute({ todo_id: "Do B", status: "completed" }, ctx);
    expect(second.success).toBe(true);
    expect(session.planTodosComplete).toBe(true);
    expect(events.filter((event) => event.type === "plan-todo-updated")).toHaveLength(3);
    expect(events.some((event) => event.type === "plan-completed")).toBe(true);
    expect(session.planPath).toBeTruthy();
  });

  it("keeps completed todos when the next todo starts, even if both tools run together", async () => {
    const { files, fs } = memoryFs();
    const { ctx } = context();
    const created = await createCreatePlanTool({ fs }).execute(
      { name: "Demo", overview: "", body: richPlanBody(), todos: ["Do A", "Do B"] },
      ctx,
    );
    expect(created.success).toBe(true);
    const path = (created.data as { path: string }).path;
    const tool = createUpdatePlanTodoTool({ fs });
    await tool.execute({ todo_id: "todo-1", status: "in_progress" }, ctx);
    const [complete, startNext] = await Promise.all([
      tool.execute({ todo_id: "todo-1", status: "completed" }, ctx),
      tool.execute({ todo_id: "todo-2", status: "in_progress" }, ctx),
    ]);
    expect(complete.success).toBe(true);
    expect(startNext.success).toBe(true);
    expect(startNext.data).toMatchObject({ done: 1, total: 2 });
    const parsed = parsePlanFile(files.get(path) ?? "", path);
    expect(parsed.todos.map((todo) => todo.status)).toEqual(["completed", "in_progress"]);
    expect(usePlanStore.getState().plans[path]?.todos.map((todo) => todo.status)).toEqual(["completed", "in_progress"]);
  });

  it("completes the previous in_progress todo when the next one starts", async () => {
    const { files, fs } = memoryFs();
    const { ctx } = context();
    const created = await createCreatePlanTool({ fs }).execute(
      { name: "Demo", overview: "", body: richPlanBody(), todos: ["Do A", "Do B"] },
      ctx,
    );
    const path = (created.data as { path: string }).path;
    const tool = createUpdatePlanTodoTool({ fs });
    await tool.execute({ todo_id: "todo-1", status: "in_progress" }, ctx);
    const next = await tool.execute({ todo_id: "todo-2", status: "in_progress" }, ctx);
    expect(next.data).toMatchObject({ done: 1, total: 2 });
    const parsed = parsePlanFile(files.get(path) ?? "", path);
    expect(parsed.todos.map((todo) => todo.status)).toEqual(["completed", "in_progress"]);
  });

  it("update_plan_todo rejects unknown todos and statuses", async () => {
    const { fs } = memoryFs();
    const { ctx } = context();
    await createCreatePlanTool({ fs }).execute({ name: "Demo", overview: "", body: richPlanBody(["Do A"]), todos: ["Do A"] }, ctx);
    const tool = createUpdatePlanTodoTool({ fs });
    expect((await tool.execute({ todo_id: "nope", status: "completed" }, ctx)).success).toBe(false);
    expect((await tool.execute({ todo_id: "todo-1", status: "flying" }, ctx)).success).toBe(false);
  });

  it("falls back to the project plan when the session has no planPath", async () => {
    const { fs } = memoryFs();
    const { session, ctx } = context();
    const created = await createCreatePlanTool({ fs }).execute(
      { name: "Demo", overview: "", body: richPlanBody(["Do A"]), todos: ["Do A"] },
      ctx,
    );
    expect(created.success).toBe(true);
    session.planPath = null;
    const tool = createUpdatePlanTodoTool({ fs });
    const result = await tool.execute({ todo_id: "todo-1", status: "completed" }, ctx);
    expect(result.success).toBe(true);
    expect(session.planPath).toBe((created.data as { path: string }).path);
  });

  it("lists that no plans exist when update_plan_todo has nothing to bind", async () => {
    const { fs } = memoryFs();
    const { ctx } = context();
    const result = await createUpdatePlanTodoTool({ fs }).execute({ todo_id: "todo-1", status: "completed" }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("no_plan");
    expect(result.error?.message).toMatch(/No plan files found under \.kursor\/plans/);
  });

  it("resolves update_plan_todo plan_id via planStore id or slug", async () => {
    const { fs } = memoryFs();
    const { session, ctx } = context();
    const created = await createCreatePlanTool({ fs }).execute(
      { name: "Sport Fitness App", overview: "", body: richPlanBody(["Do A"]), todos: ["Do A"] },
      ctx,
    );
    expect(created.success).toBe(true);
    const stored = Object.values(usePlanStore.getState().plans)[0];
    expect(stored).toBeTruthy();
    session.planPath = null;
    const tool = createUpdatePlanTodoTool({ fs });
    const bySlug = await tool.execute({ todo_id: "todo-1", status: "in_progress", plan_id: stored!.slug }, ctx);
    expect(bySlug.success).toBe(true);
    expect(bySlug.data).toMatchObject({ path: stored!.path });
    expect(resolvePlanDiskPath(stored!.slug)).toBe(stored!.path);
    session.planPath = null;
    const byId = await tool.execute({ todo_id: "todo-1", status: "completed", plan_id: stored!.id }, ctx);
    expect(byId.success).toBe(true);
  });
});

describe("applyTodoStatuses", () => {
  it("marks other in_progress todos completed when a new one starts", () => {
    const plan = {
      id: "p",
      slug: "p",
      path: "p",
      name: "p",
      overview: "",
      body: "",
      status: "building" as const,
      createdAt: 1,
      updatedAt: 1,
      todos: [
        { id: "todo-1", content: "A", status: "in_progress" as const },
        { id: "todo-2", content: "B", status: "pending" as const },
      ],
    };
    const next = applyTodoStatuses(plan, "todo-2", "in_progress");
    expect(next.todos.map((todo) => todo.status)).toEqual(["completed", "in_progress"]);
  });
});
