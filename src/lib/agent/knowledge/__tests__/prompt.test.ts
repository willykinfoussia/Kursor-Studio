import { describe, expect, it } from "vitest";
import {
  buildKnowledgeReflectUserPrompt,
  clipText,
  formatKnowledgeCatalog,
  KNOWLEDGE_REFLECT_SYSTEM,
  SPEC_AUTHOR_SYSTEM,
} from "../prompt";
import type { KnowledgeReflectInput } from "../types";

const input: KnowledgeReflectInput = {
  runId: "run-1",
  projectId: "p1",
  conversationId: "c1",
  goal: "Add JWT auth with refresh tokens",
  messages: [
    { role: "user", content: "Add JWT auth with refresh tokens" },
    { role: "assistant", content: "Implemented refresh rotation." },
  ],
  toolNames: ["write_file"],
  filesChanged: [".kursor/specs/project/technical/auth.md"],
};

describe("knowledge reflect prompt", () => {
  it("includes catalog entries and clipped conversation", () => {
    const catalog = [
      { id: "search-first", kind: "skill" as const, origin: "builtin", description: "Search the repo first" },
      { id: "auth.md", kind: "spec" as const, path: ".kursor/specs/project/technical/auth.md", scope: "project", title: "Auth" },
    ];
    const prompt = buildKnowledgeReflectUserPrompt(input, catalog);
    expect(prompt).toContain("skill search-first (builtin)");
    expect(prompt).toContain("spec .kursor/specs/project/technical/auth.md");
    expect(prompt).toContain("Goal: Add JWT auth with refresh tokens");
    expect(prompt).toContain("Files touched: .kursor/specs/project/technical/auth.md");
    expect(prompt).toContain("user: Add JWT auth with refresh tokens");
  });

  it("clips long catalog descriptions and empty catalogs", () => {
    expect(clipText("abc", 10)).toBe("abc");
    expect(clipText("abcdefghijk", 8).endsWith("…")).toBe(true);
    expect(formatKnowledgeCatalog([])).toBe("");
    expect(buildKnowledgeReflectUserPrompt(input, [])).toContain("(empty catalog)");
  });

  it("asks for a spec after product files unless the catalog already covers it", () => {
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("MUST propose a spec create");
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("update that spec instead of creating another");
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("Prefer empty arrays only when nothing durable was learned and no product files were implemented.");
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("Intention");
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("Architecture");
    expect(KNOWLEDGE_REFLECT_SYSTEM).toContain("Structure");
    expect(SPEC_AUTHOR_SYSTEM).toContain("durable project specification");
    expect(SPEC_AUTHOR_SYSTEM).toContain("## Décisions");
  });

  it("includes excerpts of the changed files", () => {
    const prompt = buildKnowledgeReflectUserPrompt(input, [], [
      { path: "frontend/src/App.tsx", content: "export function App() { return null }" },
    ]);
    expect(prompt).toContain("### frontend/src/App.tsx");
    expect(prompt).toContain("export function App() { return null }");
    expect(buildKnowledgeReflectUserPrompt(input, [])).toContain("File excerpts: none");
  });
});
