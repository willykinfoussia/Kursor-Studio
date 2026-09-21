import { describe, expect, it } from "vitest";
import type { AgentInteractionMode } from "../../modes";
import { createAskUserQuestionTool } from "../workflowTools";
import { idleToolContext } from "../result";
import { WorkflowSessionState } from "../../workflow/sessionState";
import type { AgentHarnessHooks, UserQuestionRequest } from "../../workflow/harness";
import type { AgentEvent } from "../../types";

function mockHarness(
  session = new WorkflowSessionState(),
  answer: { selected: string; allow: boolean } = { selected: "yes", allow: true },
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
    const harness = mockHarness(session, { selected: "oui", allow: true });
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
    const harness = mockHarness(session, { selected: "Yes, proceed", allow: true });
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
    const harness = mockHarness(session, { selected: "Oui, c'est bon", allow: true });
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
    const harness = mockHarness(session, { selected: "Yes, I approve", allow: false });
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
    const harness = mockHarness(session, { selected: "Oui, j'approuve", allow: false });
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
});
