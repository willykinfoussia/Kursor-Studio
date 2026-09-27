import { describe, expect, it } from "vitest";
import { groupTimelineItems, summarizeToolGroup } from "../toolGrouping";
import type { ConversationItem } from "../types";

function tool(id: string): ConversationItem {
  return { type: "tool", id: `tool:${id}`, toolCallId: id };
}

describe("groupTimelineItems", () => {
  it("groups consecutive explore tools including a single tool", () => {
    const views = groupTimelineItems(
      [tool("1"), tool("2"), tool("3")],
      new Map([
        ["1", { tool: "list_files", status: "completed" }],
        ["2", { tool: "read_file", status: "completed", input: { path: "a.ts" } }],
        ["3", { tool: "search_files", status: "completed", input: { query: "foo" } }],
      ]),
    );
    expect(views).toHaveLength(1);
    expect(views[0]?.kind).toBe("tool-group");
    if (views[0]?.kind === "tool-group") {
      expect(views[0].family).toBe("explore");
      expect(views[0].items).toHaveLength(3);
    }
  });

  it("groups consecutive mixed-family tools into one card", () => {
    const views = groupTimelineItems(
      [tool("1"), tool("2"), tool("3")],
      new Map([
        ["1", { tool: "load_skill", status: "completed", input: { skill: "brainstorming" } }],
        ["2", { tool: "read_file", status: "completed", input: { path: "a.ts" } }],
        ["3", { tool: "write_file", status: "completed", input: { path: "a.ts" } }],
      ]),
    );
    expect(views).toHaveLength(1);
    expect(views[0]?.kind).toBe("tool-group");
    if (views[0]?.kind === "tool-group") expect(views[0].items).toHaveLength(3);
  });

  it("does not split on whitespace-only assistant text", () => {
    const views = groupTimelineItems(
      [
        tool("1"),
        { type: "assistant", id: "a", messageId: "m", content: "  " },
        tool("2"),
      ],
      new Map([
        ["1", { tool: "read_file", status: "completed" }],
        ["2", { tool: "write_file", status: "completed" }],
      ]),
    );
    expect(views).toHaveLength(1);
    if (views[0]?.kind === "tool-group") expect(views[0].items).toHaveLength(2);
  });

  it("keeps failed tools inside the family group", () => {
    const views = groupTimelineItems(
      [tool("1"), tool("2")],
      new Map([
        ["1", { tool: "read_file", status: "completed" }],
        ["2", { tool: "read_file", status: "failed" }],
      ]),
    );
    expect(views).toHaveLength(1);
    if (views[0]?.kind === "tool-group") expect(views[0].items).toHaveLength(2);
  });

  it("breaks a group around assistant text", () => {
    const views = groupTimelineItems(
      [
        tool("1"),
        { type: "assistant", id: "a", messageId: "m", content: "next" },
        tool("2"),
      ],
      new Map([
        ["1", { tool: "read_file", status: "completed" }],
        ["2", { tool: "read_file", status: "completed" }],
      ]),
    );
    expect(views).toHaveLength(3);
    expect(views[1]).toMatchObject({ kind: "item" });
  });

  it("breaks a group around a user question", () => {
    const views = groupTimelineItems(
      [
        tool("1"),
        {
          type: "user-question",
          id: "q1",
          questionId: "q1",
          prompt: "Which UI?",
          options: [{ id: "a", label: "A" }],
        },
        tool("2"),
      ],
      new Map([
        ["1", { tool: "read_file", status: "completed" }],
        ["2", { tool: "read_file", status: "completed" }],
      ]),
    );
    expect(views).toHaveLength(3);
    expect(views[1]).toMatchObject({ kind: "item" });
  });

  it("merges user questions separated by an assistant message or a tool", () => {
    const question = (id: string): ConversationItem => ({
      type: "user-question",
      id,
      questionId: id,
      prompt: id,
      options: [{ id: "a", label: "A" }],
    });
    const views = groupTimelineItems(
      [
        tool("1"),
        question("q1"),
        { type: "assistant", id: "a", messageId: "m", content: "next" },
        tool("2"),
        question("q2"),
      ],
      new Map([
        ["1", { tool: "ask_user_question", status: "completed" }],
        ["2", { tool: "ask_user_question", status: "completed" }],
      ]),
    );
    expect(views.map((view) => view.kind)).toEqual(["tool-group", "item", "tool-group", "question-chain"]);
    const chain = views[3];
    expect(chain?.kind).toBe("question-chain");
    if (chain?.kind === "question-chain") {
      expect(chain.items.map((item) => item.questionId)).toEqual(["q1", "q2"]);
    }
  });

  it("keeps two question panels when a user message sits between them", () => {
    const question = (id: string): ConversationItem => ({
      type: "user-question",
      id,
      questionId: id,
      prompt: id,
      options: [{ id: "a", label: "A" }],
    });
    const views = groupTimelineItems(
      [
        question("q1"),
        { type: "user", id: "u", messageId: "m" },
        question("q2"),
      ],
      new Map(),
    );
    expect(views.map((view) => view.kind)).toEqual(["item", "item", "item"]);
    expect(views.filter((view) => view.kind === "question-chain")).toHaveLength(0);
  });

  it("leaves a single question in place and keeps text after a chain behind the panel", () => {
    const question = (id: string): ConversationItem => ({
      type: "user-question",
      id,
      questionId: id,
      prompt: id,
      options: [{ id: "a", label: "A" }],
    });
    const alone = groupTimelineItems(
      [
        question("q1"),
        { type: "assistant", id: "a", messageId: "m", content: "thanks" },
      ],
      new Map(),
    );
    expect(alone.map((view) => view.kind)).toEqual(["item", "item"]);
    expect(alone[0]).toMatchObject({ kind: "item", item: { type: "user-question", questionId: "q1" } });

    const trailed = groupTimelineItems(
      [
        question("q1"),
        question("q2"),
        { type: "assistant", id: "a2", messageId: "m2", content: "done" },
        { type: "plan-card", id: "p", planId: "plan" },
      ],
      new Map(),
    );
    expect(trailed.map((view) => view.kind)).toEqual(["question-chain", "item", "item"]);
    expect(trailed[1]).toMatchObject({ kind: "item", item: { type: "assistant" } });
    expect(trailed[2]).toMatchObject({ kind: "item", item: { type: "plan-card" } });
  });

  it("summarizes explore, edit, commands and verification", () => {
    expect(summarizeToolGroup([
      { tool: "read_file", status: "completed", input: { path: "a.ts" } },
      { tool: "read_file", status: "completed", input: { path: "b.ts" } },
      { tool: "search_files", status: "completed", input: { query: "x" } },
    ]).title).toBe("Explored 2 files, 1 search");
    expect(summarizeToolGroup([
      { tool: "write_file", status: "completed", input: { path: "a.ts" } },
      { tool: "apply_patch", status: "completed", input: { path: "b.ts" } },
    ]).title).toBe("Edited 2 files");
    expect(summarizeToolGroup([
      { tool: "run_command", status: "completed", input: { command: "pnpm lint" } },
      { tool: "run_command", status: "failed", input: { command: "pnpm test" } },
    ]).title).toContain("Ran 2 commands");
    expect(summarizeToolGroup([
      { tool: "run_command", status: "completed", input: { command: "pnpm lint" } },
      { tool: "run_command", status: "failed", input: { command: "pnpm test" } },
    ]).failed).toBe(1);
  });

  it("summarizes load_skill as Used N skill(s)", () => {
    expect(summarizeToolGroup([
      { tool: "load_skill", status: "completed", input: { skill: "brainstorming" } },
    ]).title).toBe("Used 1 skill");
    expect(summarizeToolGroup([
      { tool: "load_skill", status: "completed", input: { skill: "brainstorming" } },
      { tool: "load_skill", status: "completed", input: { skill: "writing-plans" } },
    ]).title).toBe("Used 2 skills");
  });

  it("joins mixed family titles", () => {
    const summary = summarizeToolGroup([
      { tool: "load_skill", status: "completed", input: { skill: "brainstorming" } },
      { tool: "read_file", status: "completed", input: { path: "a.ts" } },
      { tool: "write_file", status: "completed", input: { path: "a.ts" } },
    ]);
    expect(summary.title).toContain("Used 1 skill");
    expect(summary.title).toContain("Read 1 file");
    expect(summary.title).toContain("Edited 1 file");
  });
});
