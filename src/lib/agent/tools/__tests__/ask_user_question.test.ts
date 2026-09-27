import { describe, expect, it } from "vitest";
import type { AgentInteractionMode } from "../../modes";
import { createAskUserQuestionTool } from "../workflowTools";
import { idleToolContext } from "../result";
import { WorkflowSessionState } from "../../workflow/sessionState";
import type { AgentHarnessHooks, UserQuestionAnswer, UserQuestionRequest } from "../../workflow/harness";
import type { AgentEvent } from "../../types";

function mockHarness(
  session = new WorkflowSessionState(),
  answer: UserQuestionAnswer = { selected: "yes", allow: true },
  onAsk?: (request: UserQuestionRequest) => void,
): AgentHarnessHooks {
  const harness: AgentHarnessHooks = {
    workflow: session,
    isSubagent: false,
    askUser: async (request) => {
      onAsk?.(request);
      return answer;
    },
    spawnAgent: async () => ({
      agentId: "explore",
      summary: "",
      findings: [],
      filesChanged: [],
      tests: [],
      issues: [],
    }),
    enterPlanMode: () => harness.switchAgentMode("plan"),
    switchAgentMode: (mode: AgentInteractionMode) => {
      if (mode !== "agent" && mode !== "plan") {
        return { ok: false, message: "Ask and Debug can only be selected by the user." };
      }
      session.setInteractionMode(mode);
      return { ok: true, message: `${mode} on` };
    },
    ensureAgentBranch: async () => ({ message: "ok" }),
    finishBranch: async () => ({ message: "ok" }),
  };
  return harness;
}

describe("ask_user_question", () => {
  it("does not treat kind plan as a design approval", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const events: AgentEvent[] = [];
    const harness = mockHarness(session);
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      { prompt: "Je lance le build ?", kind: "plan", options: ["oui", "non"] },
      idleToolContext("C:/Projects/TodoApp", {
        harness,
        skillSession: { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never,
      }),
    );
    expect(result.success).toBe(true);
    expect(session.designApproved).toBeNull();
    expect(events.some((event) => event.type === "design-gate")).toBe(false);
  });

  it("records designApproved on oui when kind is design and options are yes/no", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const events: AgentEvent[] = [];
    const harness = mockHarness(session, { selected: "oui", allow: true, reply: "design_yes" });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      { prompt: "Ce design vous convient ?", kind: "design", options: ["oui", "non"] },
      idleToolContext("C:/Projects/TodoApp", {
        harness,
        skillSession: { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never,
      }),
    );
    expect(result.success).toBe(true);
    expect(session.designApproved).toBeTruthy();
    expect(session.planApproved).toBe(false);
    expect(session.interactionMode).toBe("plan");
    expect(session.designNotes).toEqual([]);
    expect(events.some((event) => event.type === "design-gate")).toBe(true);
  });

  it("records designApproved on Yes, proceed even when the other option is Changes needed", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const events: AgentEvent[] = [];
    const harness = mockHarness(session, { selected: "Yes, proceed", allow: true, reply: "design_yes" });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt: "Approve the golf app design?",
        kind: "design",
        options: [
          { id: "yes", label: "Yes, proceed" },
          { id: "changes", label: "Changes needed", description: "Tell me what to adjust" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", {
        harness,
        skillSession: { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never,
      }),
    );
    expect(result.success).toBe(true);
    expect(session.designApproved).toBeTruthy();
    expect(session.interactionMode).toBe("plan");
    expect(events.some((event) => event.type === "design-gate")).toBe(true);
  });

  it("records designApproved on Oui, c'est bon even when the other option is Modifier quelque chose", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const events: AgentEvent[] = [];
    const harness = mockHarness(session, { selected: "Oui, c'est bon", allow: true, reply: "design_yes" });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt: "Ce design vous convient ?",
        kind: "design",
        options: [
          { id: "yes", label: "Oui, c'est bon" },
          { id: "changes", label: "Modifier quelque chose" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", {
        harness,
        skillSession: { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never,
      }),
    );
    expect(result.success).toBe(true);
    expect(session.designApproved).toBeTruthy();
    expect(session.interactionMode).toBe("plan");
    expect(events.some((event) => event.type === "design-gate")).toBe(true);
  });

  it("records designApproved on Yes, I approve", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const harness = mockHarness(session, { selected: "Yes, I approve", allow: false, reply: "design_yes" });
    const tool = createAskUserQuestionTool();
    await tool.execute(
      {
        prompt: "Please confirm the golf app design",
        kind: "design",
        options: [
          { id: "yes-chat", label: "Yes, I approve" },
          { id: "changes", label: "I want changes" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(session.designApproved).toBeTruthy();
    expect(session.interactionMode).toBe("plan");
  });

  it("records designApproved on Oui, j'approuve", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const harness = mockHarness(session, { selected: "Oui, j'approuve", allow: false, reply: "design_yes" });
    const tool = createAskUserQuestionTool();
    await tool.execute(
      {
        prompt: "Ce design te convient-il ?",
        kind: "design",
        options: [
          { id: "yes", label: "Oui, j'approuve", description: "React 18 + TypeScript + Vite" },
          { id: "changes", label: "Non, je veux changer quelque chose" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(session.designApproved).toBeTruthy();
    expect(session.designNotes).not.toContain("Oui, j'approuve");
    expect(session.interactionMode).toBe("plan");
  });

  it("does not record designApproved on a multiple-choice question even if selected is yes", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const harness = mockHarness(session, { selected: "yes", allow: true });
    const tool = createAskUserQuestionTool();
    await tool.execute(
      {
        prompt: "Quelle stack technique préférez-vous ?",
        kind: "design",
        options: [
          { label: "Next.js + TypeScript", description: "Full-stack React" },
          { label: "React + Node/Express", description: "Frontend séparé" },
          { label: "Python + FastAPI", description: "Backend Python" },
          { label: "Je préfère que vous choisissiez", description: "Vous choisissez" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(session.designApproved).toBeNull();
    expect(session.interactionMode).toBe("agent");
  });

  it("parses object options and returns the clicked label", async () => {
    const session = new WorkflowSessionState();
    let asked: UserQuestionRequest | undefined;
    const harness = mockHarness(session, { selected: "Crypto / Finance", allow: true }, (request) => {
      asked = request;
    });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt: "Quelle sorte d'application de trading visez-vous ?",
        kind: "design",
        options: [
          { label: "Crypto / Finance", description: "Trading de cryptomonnaies ou d'actifs financiers" },
          { label: "Simulation / Paper Trading", description: "Données fictives" },
        ],
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.success).toBe(true);
    expect(asked?.options).toEqual([
      { id: "Crypto / Finance", label: "Crypto / Finance", description: "Trading de cryptomonnaies ou d'actifs financiers" },
      { id: "Simulation / Paper Trading", label: "Simulation / Paper Trading", description: "Données fictives" },
    ]);
    expect(result.data).toMatchObject({ selected: "Crypto / Finance" });
    expect(session.designApproved).toBeNull();
    expect(session.designNotes).toEqual(["Crypto / Finance"]);
  });

  it("does not record designApproved on ok during brainstorming", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const harness = mockHarness(session, { selected: "ok", allow: true });
    const tool = createAskUserQuestionTool();
    await tool.execute(
      { prompt: "On continue ?", kind: "design" },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(session.designApproved).toBeNull();
    expect(session.interactionMode).toBe("agent");
  });

  it("does not re-emit design-gate when the design is already approved", async () => {
    const session = new WorkflowSessionState();
    session.approveDesign("already");
    session.markSkillCheck("brainstorming");
    const events: AgentEvent[] = [];
    const harness = mockHarness(session, { selected: "yes", allow: true });
    const tool = createAskUserQuestionTool();
    await tool.execute(
      { prompt: "Toujours bon ?", kind: "design" },
      idleToolContext("C:/Projects/TodoApp", {
        harness,
        skillSession: { workflow: session, emit: (event: AgentEvent) => events.push(event) } as never,
      }),
    );
    expect(events.some((event) => event.type === "design-gate")).toBe(false);
  });

  it("never sets planApproved from kind plan", async () => {
    const session = new WorkflowSessionState();
    session.approveDesign("already");
    const harness = mockHarness(session);
    const tool = createAskUserQuestionTool();
    await tool.execute(
      { prompt: "Approve the plan?", kind: "plan" },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(session.planApproved).toBe(false);
  });

  it("recovers options mashed into prompt as XML and asks with those choices", async () => {
    const session = new WorkflowSessionState();
    let asked: UserQuestionRequest | undefined;
    const harness = mockHarness(session, { selected: "workout", allow: true }, (request) => {
      asked = request;
    });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt: `Quel type d'application de boxe veux-tu créer ?</<arg_key>options</arg_key>\n<arg_value>[{"id":"workout","label":"Entraînement"},{"id":"game","label":"Jeu"}]`,
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.success).toBe(true);
    expect(asked?.prompt).toBe("Quel type d'application de boxe veux-tu créer ?");
    expect(asked?.options.map((choice) => choice.id)).toEqual(["workout", "game"]);
    expect(result.data).toMatchObject({ selected: "workout" });
  });

  it("parses options passed as a JSON array string", async () => {
    const session = new WorkflowSessionState();
    let asked: UserQuestionRequest | undefined;
    const harness = mockHarness(session, { selected: "Entraînement", allow: true }, (request) => {
      asked = request;
    });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt: "Quel type d'application de boxe veux-tu créer ?",
        options: '[{"id":"workout","label":"Entraînement"},{"id":"game","label":"Jeu"}]',
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.success).toBe(true);
    expect(asked?.options.map((choice) => choice.id)).toEqual(["workout", "game"]);
  });

  it("fails fast when options are still empty after sanitize and does not wait on askUser", async () => {
    const session = new WorkflowSessionState();
    const askUser = async () => {
      throw new Error("askUser should not be called");
    };
    const harness = mockHarness(session);
    harness.askUser = askUser;
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      { prompt: "Quel type d'application veux-tu ?" },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(result.error?.message).toMatch(/non-empty options/i);
  });

  it("records expanded matrix notes and allows the choice when the classifier says none", async () => {
    const session = new WorkflowSessionState();
    session.goalKind = "build";
    session.markSkillCheck("brainstorming");
    const prompt = `What design choices do you want? Choose one option per row.

1. Drink images:
- A: Add placeholder product images to the repo
- B: Use placeholder/image CDN URLs
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
- B: No — keep local cart`;
    const harness = mockHarness(session, {
      selected: "1C 2A 3C 4A 5B 6A",
      allow: false,
      reply: "none",
    });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      {
        prompt,
        options: ["1A 2A 3A 4B 5A 6A", "1C 2A 3C 4A 5B 6A", "Custom choices (paste yours)"],
      },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ selected: "1C 2A 3C 4A 5B 6A", allow: true });
    expect(session.designApproved).toBeNull();
    expect(session.designNotes).toEqual([
      "Drink images: Let the admin upload images (file upload route)",
      "User account auth: Email+password register/login with JWT sessions",
      "User profile page: Both",
      "Image quality default: WebP",
      "Image serving: CDN / external URL",
      "Persist cart per user: Yes — migrate local cart to backend cart table",
    ]);
  });

  it("does not allow a design rejection", async () => {
    const session = new WorkflowSessionState();
    const harness = mockHarness(session, { selected: "non", allow: true, reply: "design_no" });
    const tool = createAskUserQuestionTool();
    const result = await tool.execute(
      { prompt: "Ce design vous convient ?", kind: "design", options: ["oui", "non"] },
      idleToolContext("C:/Projects/TodoApp", { harness }),
    );
    expect(result.data).toMatchObject({ selected: "non", allow: false });
    expect(session.designApproved).toBeNull();
    expect(session.designNotes).toEqual([]);
  });
});
