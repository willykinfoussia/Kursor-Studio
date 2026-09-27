import { describe, expect, it } from "vitest";
import {
  expandMatrixSelection,
  formatMatrixSelection,
  normalizeAskUserQuestionInput,
  parseMatrixQuestion,
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
    expect(shouldApproveDesignFromQuestion("design", yesNo, "oui", "design_yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("question", yesNo, "oui", "design_yes")).toBe(false);
  });

  it("approves Yes, proceed even when the other option is Changes needed", () => {
    const golf = parseQuestionOptions([
      { id: "yes", label: "Yes, proceed" },
      { id: "changes", label: "Changes needed", description: "Tell me what to adjust" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", golf, "Yes, proceed", "design_yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", golf, "yes", "design_yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", golf, "Changes needed", "none")).toBe(false);
  });

  it("approves Yes, I approve on a design picker", () => {
    const confirm = parseQuestionOptions([
      { id: "yes-chat", label: "Yes, I approve" },
      { id: "changes", label: "I want changes" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Yes, I approve", "design_yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", confirm, "I want changes", "none")).toBe(false);
  });

  it("approves Oui, j'approuve on a design picker", () => {
    const confirm = parseQuestionOptions([
      { id: "yes", label: "Oui, j'approuve" },
      { id: "changes", label: "Non, je veux changer quelque chose" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Oui, j'approuve", "design_yes")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", confirm, "Non, je veux changer quelque chose", "design_no")).toBe(false);
  });

  it("does not approve a stack or product MCQ even on yes", () => {
    const stacks = parseQuestionOptions([
      { label: "Next.js + TypeScript", description: "Full-stack" },
      { label: "Python + FastAPI", description: "Backend Python" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", stacks, "yes", "design_yes")).toBe(false);
    expect(shouldApproveDesignFromQuestion("design", stacks, "Next.js + TypeScript", "none")).toBe(false);
  });

  it("parses a numbered one-option-per-row prompt and expands the code", () => {
    const prompt = `What design choices do you want for the drink images and user account feature? Choose one option per row.

1. Drink images:
- A: Add placeholder product images to the repo
- B: Use placeholder/image CDN URLs (picsum/placehold.co)
- C: Let the admin upload images (file upload route)

2. User account auth:
- A: Email+password register/login with JWT sessions
- B: OAuth (Google/GitHub)
- C: Magic link / passwordless

3. User profile page:
- A: Order history + saved addresses
- B: Saved favorites + address book
- C: Both

4. Image quality default:
- A: WebP
- B: PNG
- C: Either — keep original format

5. Image serving:
- A: Express static /public/images
- B: CDN / external URL
- C: Base64 embedded

6. Persist cart per user:
- A: Yes — migrate local cart to backend cart table
- B: No — keep local cart

Tell me your choices (1-6) or paste your own.`;
    const matrix = parseMatrixQuestion(prompt);
    expect(matrix?.rows).toHaveLength(6);
    expect(matrix?.intro).toMatch(/Choose one option per row/);
    expect(matrix?.rows[0]).toMatchObject({
      n: 1,
      title: "Drink images",
    });
    expect(matrix?.rows[0]?.choices.map((choice) => choice.id)).toEqual(["A", "B", "C"]);
    expect(matrix?.rows[5]?.choices).toHaveLength(2);
    const picks = { 1: "C", 2: "A", 3: "C", 4: "A", 5: "B", 6: "A" };
    expect(formatMatrixSelection(matrix!.rows, picks)).toBe("1C 2A 3C 4A 5B 6A");
    expect(expandMatrixSelection(prompt, "1C 2A 3C 4A 5B 6A")).toEqual([
      "Drink images: Let the admin upload images (file upload route)",
      "User account auth: Email+password register/login with JWT sessions",
      "User profile page: Both",
      "Image quality default: WebP",
      "Image serving: CDN / external URL",
      "Persist cart per user: Yes — migrate local cart to backend cart table",
    ]);
  });

  it("does not split a normal question or a numbered list without letters", () => {
    expect(parseMatrixQuestion("Which UI do you want?")).toBeNull();
    expect(parseMatrixQuestion("Should we keep the list [1,2,3] in the timer UI?")).toBeNull();
    expect(parseMatrixQuestion("1. First idea\n2. Second idea")).toBeNull();
    expect(expandMatrixSelection("Which UI?", "1C 2A")).toEqual([]);
  });

  it("approves Yes, approve on a design question even when JEV says none", () => {
    const approve = parseQuestionOptions([
      { id: "yes", label: "Yes, approve" },
      { id: "tweak", label: "Picsum size/format tweak" },
    ]);
    expect(shouldApproveDesignFromQuestion("design", approve, "Yes, approve", "none")).toBe(true);
    expect(shouldApproveDesignFromQuestion("design", approve, "Picsum size/format tweak", "none")).toBe(false);
  });
});
