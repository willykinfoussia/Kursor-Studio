import { describe, expect, it } from "vitest";
import {
  normalizeAskUserQuestionInput,
  parseQuestionOptions,
  shouldApproveDesignFromQuestion,
} from "../questionOptions";

const BOXING_PROMPT = `Quel type d'application de boxe veux-tu créer ?</<arg_key>options</arg_key>
<arg_value>[{"id": "workout", "label": "Appli d'entraînement / conditionnement physique", "description": "Workouts de boxe"}, {"id": "scorecard", "label": "Carte de score / compétition", "description": "Rounds et points"}, {"id": "game", "label": "Jeu de boxe", "description": "Jeu interactif"}, {"id": "tracker", "label": "Suivi d'entraînement personnel", "description": "Historique des séances"}]`;

describe("parseQuestionOptions", () => {
  it("keeps string choices", () => {
    expect(parseQuestionOptions(["oui", "non"])).toEqual([
      { id: "oui", label: "oui" },
      { id: "non", label: "non" },
    ]);
  });

  it("keeps label and description objects", () => {
    expect(parseQuestionOptions([
      { label: "Crypto / Finance", description: "Cours temps réel" },
      { id: "paper", label: "Simulation", description: "Sans vrais ordres" },
    ])).toEqual([
      { id: "Crypto / Finance", label: "Crypto / Finance", description: "Cours temps réel" },
      { id: "paper", label: "Simulation", description: "Sans vrais ordres" },
    ]);
  });

  it("parses a JSON array string instead of splitting on commas", () => {
    expect(parseQuestionOptions('[{"id":"workout","label":"Entraînement"},{"id":"game","label":"Jeu"}]')).toEqual([
      { id: "workout", label: "Entraînement" },
      { id: "game", label: "Jeu" },
    ]);
  });

  it("still splits a comma-separated string", () => {
    expect(parseQuestionOptions("oui, non")).toEqual([
      { id: "oui", label: "oui" },
      { id: "non", label: "non" },
    ]);
  });
});

describe("normalizeAskUserQuestionInput", () => {
  it("recovers boxing XML mashed into prompt", () => {
    const normalized = normalizeAskUserQuestionInput({ prompt: BOXING_PROMPT, arg_key: "options" });
    expect(normalized.prompt).toBe("Quel type d'application de boxe veux-tu créer ?");
    expect(normalized).not.toHaveProperty("arg_key");
    const options = parseQuestionOptions(normalized.options);
    expect(options.map((choice) => choice.id)).toEqual(["workout", "scorecard", "game", "tracker"]);
    expect(options[0]?.description).toMatch(/Workouts/);
  });

  it("does not treat arg_key leftover strings as a choice", () => {
    const normalized = normalizeAskUserQuestionInput({
      prompt: "Quel type d'application veux-tu ?",
      arg_key: "options",
    });
    expect(normalized).not.toHaveProperty("options");
  });

  it("recovers options from an arg_value JSON extra key", () => {
    const normalized = normalizeAskUserQuestionInput({
      prompt: "Quel type d'application veux-tu ?",
      arg_key: "options",
      arg_value: '[{"id":"workout","label":"Entraînement"},{"id":"game","label":"Jeu"}]',
    });
    expect(parseQuestionOptions(normalized.options).map((choice) => choice.id)).toEqual(["workout", "game"]);
  });

  it("does not treat a numeric array in the question text as options", () => {
    const prompt = "Should we keep the list [1,2,3] in the timer UI?";
    const normalized = normalizeAskUserQuestionInput({ prompt });
    expect(normalized.prompt).toBe(prompt);
    expect(normalized).not.toHaveProperty("options");
  });
});

describe("shouldApproveDesignFromQuestion", () => {
  it("approves a yes on a yes/no design question", () => {
    const yesNo = parseQuestionOptions(["oui", "non"]);
    expect(shouldApproveDesignFromQuestion("design", yesNo, "oui")).toBe(true);
    expect(shouldApproveDesignFromQuestion("question", yesNo, "oui")).toBe(false);
  });

  it("approves Yes, proceed even when the other option is Changes needed", () => {
    const golf = parseQuestionOptions([
      { id: "yes", label: "Yes, proceed" },
      { id: "changes", label: "Changes needed", description: "Tell me what to adjust" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", golf, "Yes, proceed")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", golf, "yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", golf, "Changes needed")).toBe(false);
  });

  it("approves Yes, I approve on a design picker", () => {
    const confirm = parseQuestionOptions([
      { id: "yes-chat", label: "Yes, I approve" },
      { id: "changes", label: "I want changes" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Yes, I approve")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", confirm, "I want changes")).toBe(false);
  });

  it("approves Oui, j'approuve on a design picker", () => {
    const confirm = parseQuestionOptions([
      { id: "yes", label: "Oui, j'approuve" },
      { id: "changes", label: "Non, je veux changer quelque chose" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Oui, j'approuve")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Non, je veux changer quelque chose")).toBe(false);
  });

  it("does not approve a stack or product MCQ even on yes", () => {
    const stacks = parseQuestionOptions([
      { label: "Next.js + TypeScript", description: "Full-stack" },
      { label: "Python + FastAPI", description: "Backend Python" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", stacks, "yes")).toBe(false);
    expect(shouldApproveDesignFromQuestion("design", stacks, "Next.js + TypeScript")).toBe(false);
  });
});
