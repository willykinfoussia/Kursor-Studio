import { describe, expect, it } from "vitest";
import {
  createPlanDocument,
  isPlanDocumentPath,
  isPlanFilePath,
  parsePlanFile,
  planPathFor,
  serializePlanFile,
  slugifyPlanName,
} from "../planFile";

describe("planFile", () => {
  it("round-trips a plan with todos, quotes, and commas", () => {
    const plan = createPlanDocument({
      name: 'Auth, "SSO" & co',
      overview: "Ship login, with commas, quotes \"here\".",
      body: "# Auth plan\n\n## Objectif\n\nFaire vite.",
      todos: ["Write the failing test", "Implement login, then logout"],
    });
    const text = serializePlanFile(plan);
    expect(text).toContain(".kursor/plans/");
    const parsed = parsePlanFile(text, plan.path);
    expect(parsed).toMatchObject({
      name: 'Auth, "SSO" & co',
      overview: 'Ship login, with commas, quotes "here".',
      status: "draft",
    });
    expect(parsed.body).toContain("## Objectif");
    expect(parsed.todos.map((todo) => todo.content)).toEqual([
      "Write the failing test",
      "Implement login, then logout",
    ]);
    expect(parsed.todos.map((todo) => todo.status)).toEqual(["pending", "pending"]);
  });

  it("preserves todo statuses across serialize and parse", () => {
    const plan = createPlanDocument({ name: "Demo", overview: "", body: "", todos: ["a", "b", "c"] });
    plan.todos[0]!.status = "in_progress";
    plan.todos[1]!.status = "completed";
    plan.todos[2]!.status = "cancelled";
    const parsed = parsePlanFile(serializePlanFile(plan), plan.path);
    expect(parsed.todos.map((todo) => todo.status)).toEqual(["in_progress", "completed", "cancelled"]);
  });

  it("reads inline todo objects", () => {
    const raw = [
      "---",
      'name: Inline',
      "todos:",
      '  - { id: "todo-9", content: "Do it, fast", status: "completed" }',
      "---",
      "",
      "body",
      "",
    ].join("\n");
    const parsed = parsePlanFile(raw, ".kursor/plans/inline.plan.md");
    expect(parsed.todos).toEqual([{ id: "todo-9", content: "Do it, fast", status: "completed" }]);
  });

  it("classifies plan paths", () => {
    expect(isPlanFilePath(".kursor/plans/demo.plan.md")).toBe(true);
    expect(isPlanFilePath(".kursor/plans/demo.md")).toBe(false);
    expect(isPlanFilePath("src/a.ts")).toBe(false);
    expect(isPlanDocumentPath(".kursor/plans/demo.plan.md")).toBe(true);
    expect(isPlanDocumentPath("docs/superpowers/plans/old.md")).toBe(true);
    expect(isPlanDocumentPath("src/a.ts")).toBe(false);
  });

  it("builds safe slugs and paths", () => {
    expect(slugifyPlanName("  Héllo, World! ")).toBe("hello-world");
    expect(planPathFor("demo")).toBe(".kursor/plans/demo.plan.md");
    const plan = createPlanDocument({ name: "Demo", overview: "", body: "", todos: ["a"] });
    expect(plan.path).toMatch(/^\.kursor\/plans\/demo_[0-9a-f]{6}\.plan\.md$/);
    expect(plan.todos[0]?.id).toBe("todo-1");
  });
});
