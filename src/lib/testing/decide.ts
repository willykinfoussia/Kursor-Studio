import type { AIService, ChoiceEvaluationQuestion, EvaluateState } from "../agent/AIService";
import type {
  ApplicationType,
  LevelDecision,
  ProjectDiscovery,
  RunnerId,
  TestStrategyDecision,
  UserCase,
} from "./domain";
import { applicationType, runnersFor, scriptPrefers } from "./discover";

const UNIT_ORDER: RunnerId[] = ["vitest", "jest", "pytest", "cargo", "go", "junit", "dotnet"];

export function policyDecision(discovery: ProjectDiscovery): TestStrategyDecision {
  const app = applicationType(discovery);
  const unit = decideUnit(discovery, app);
  const integration: LevelDecision = { ...unit, testLevel: "integration", reasons: unit.reasons.map((reason) => reason) };
  const e2e = decideE2E(discovery, app);
  return {
    applicationType: app,
    unit,
    integration,
    e2e,
    reasons: [...unit.reasons, ...e2e.reasons],
  };
}

export function constrainDecision(discovery: ProjectDiscovery, proposed: TestStrategyDecision): TestStrategyDecision {
  const legal = policyDecision(discovery);
  const unit = constrainLevel(discovery, legal.unit, proposed.unit);
  return {
    applicationType: legal.applicationType,
    unit,
    integration: { ...constrainLevel(discovery, legal.integration, proposed.integration), runner: unit.runner, action: unit.action },
    e2e: constrainLevel(discovery, legal.e2e, proposed.e2e),
    reasons: proposed.reasons.length > 0 ? proposed.reasons : legal.reasons,
  };
}

export async function decideStrategy(
  discovery: ProjectDiscovery,
  ai?: AIService,
  userCases: UserCase[] = [],
  signal?: AbortSignal,
): Promise<{ decision: TestStrategyDecision; userCases: UserCase[] }> {
  const base = policyDecision(discovery);
  const questions = jevQuestions(discovery, base, userCases);
  if (!ai?.evaluate || Object.keys(questions).length === 0) {
    return { decision: base, userCases };
  }
  try {
    const result = await ai.evaluate({
      state: discoveryState(discovery, userCases),
      questions,
      signal,
    });
    const proposed = applyJevAnswers(base, result.answers);
    const ranked = rankCases(userCases, result.answers);
    return { decision: constrainDecision(discovery, proposed), userCases: ranked };
  } catch {
    return { decision: base, userCases };
  }
}

export function jevQuestions(
  discovery: ProjectDiscovery,
  base: TestStrategyDecision,
  userCases: UserCase[],
): Record<string, ChoiceEvaluationQuestion> {
  const questions: Record<string, ChoiceEvaluationQuestion> = {};
  const unitChoices = runnersFor(discovery, "unit").filter((runner) => UNIT_ORDER.includes(runner.id));
  if (unitChoices.length > 1) {
    questions.unitRunner = {
      type: "choice",
      instructions: "Which already installed unit test runner should be reused? Do not introduce a second framework.",
      criteria: Object.fromEntries(unitChoices.map((runner) => [runner.id, `${runner.id} is already configured`])),
    };
  }
  const e2eChoices = e2eCriteria(discovery, base);
  if (e2eChoices) {
    questions.e2eAction = {
      type: "choice",
      instructions: "Which end-to-end action is appropriate for this project?",
      criteria: e2eChoices,
    };
  }
  for (const userCase of userCases.slice(0, 8)) {
    questions[`uc_${safeKey(userCase.id)}`] = {
      type: "choice",
      instructions: `Is the user case "${userCase.name}" a critical business path that should be covered by an end-to-end test?`,
      criteria: {
        critical: "Authentication, payment, main CRUD, or the primary user journey.",
        normal: "Secondary or internal behavior. Unit or integration coverage is enough.",
      },
    };
  }
  return questions;
}

function decideUnit(discovery: ProjectDiscovery, app: ApplicationType): LevelDecision {
  const present = runnersFor(discovery, "unit");
  const preferred = scriptPrefers(discovery, present.map((runner) => runner.id)) ?? present[0]?.id ?? null;
  const chosen = present.find((runner) => runner.id === preferred) ?? present[0];
  if (chosen) {
    return {
      testLevel: "unit",
      applicationType: app,
      runner: chosen.id,
      action: chosen.present ? "use_existing" : "install",
      reasons: [
        chosen.present
          ? `${chosen.id} already exists in the project`
          : `${discovery.ecosystem} project can use ${chosen.id}`,
      ],
    };
  }
  if (discovery.ecosystem === "node") {
    return {
      testLevel: "unit",
      applicationType: app,
      runner: "vitest",
      action: "install",
      reasons: ["Node project has no unit runner", "Vitest is the default for a Node project without a test framework"],
    };
  }
  if (discovery.ecosystem === "python") {
    return {
      testLevel: "unit",
      applicationType: app,
      runner: "pytest",
      action: "install",
      reasons: ["Python project has no pytest configuration"],
    };
  }
  return {
    testLevel: "unit",
    applicationType: app,
    runner: null,
    action: "not_applicable",
    reasons: ["No unit test runner could be selected for this stack"],
  };
}

function decideE2E(discovery: ProjectDiscovery, app: ApplicationType): LevelDecision {
  const present = runnersFor(discovery, "e2e");
  const preferred = scriptPrefers(discovery, present.map((runner) => runner.id));
  const chosen = present.find((runner) => runner.id === preferred) ?? present[0];
  if (chosen) {
    return {
      testLevel: "e2e",
      applicationType: app,
      runner: chosen.id,
      action: "use_existing",
      reasons: [`${chosen.id} already exists in the project`],
    };
  }
  if (app === "web") {
    return {
      testLevel: "e2e",
      applicationType: app,
      runner: "playwright",
      action: "install",
      reasons: ["Web application detected", "No E2E framework detected"],
    };
  }
  if (app === "mobile") {
    return {
      testLevel: "e2e",
      applicationType: app,
      runner: "appium",
      action: "install",
      reasons: ["Mobile application detected", "No mobile E2E runner detected"],
    };
  }
  return {
    testLevel: "e2e",
    applicationType: app,
    runner: null,
    action: "not_applicable",
    reasons: ["No graphical user journey"],
  };
}

function constrainLevel(discovery: ProjectDiscovery, legal: LevelDecision, proposed: LevelDecision | undefined): LevelDecision {
  if (!proposed) return legal;
  if (legal.action === "not_applicable") return legal;
  if (legal.action === "use_existing") {
    if (proposed.action === "use_existing" && proposed.runner === legal.runner) {
      return { ...legal, reasons: proposed.reasons.length > 0 ? proposed.reasons : legal.reasons };
    }
    const stillThere = runnersFor(discovery, legal.testLevel).some((runner) => runner.id === proposed.runner);
    if (proposed.action === "use_existing" && proposed.runner && stillThere && legal.testLevel === "unit") {
      return {
        ...legal,
        runner: proposed.runner,
        reasons: proposed.reasons.length > 0 ? proposed.reasons : [`Reuse existing ${proposed.runner}`],
      };
    }
    return legal;
  }
  if (legal.testLevel === "e2e" && legal.applicationType === "mobile" && proposed.action === "not_applicable") {
    return {
      ...legal,
      runner: null,
      action: "not_applicable",
      reasons: proposed.reasons.length > 0 ? proposed.reasons : ["Jev marked mobile E2E as not applicable"],
    };
  }
  if (proposed.action === "install" && proposed.runner === legal.runner) {
    return { ...legal, reasons: proposed.reasons.length > 0 ? proposed.reasons : legal.reasons };
  }
  return legal;
}

function e2eCriteria(discovery: ProjectDiscovery, base: TestStrategyDecision): Record<string, string> | null {
  const present = runnersFor(discovery, "e2e");
  if (present.length > 1) {
    return Object.fromEntries(present.map((runner) => [`use_${runner.id}`, `Reuse the existing ${runner.id} setup`]));
  }
  if (base.applicationType === "mobile" && base.e2e.action === "install") {
    return {
      install_appium: "Native or hybrid mobile UI. Install Appium.",
      not_applicable: "No user-facing mobile journey to automate.",
    };
  }
  return null;
}

function applyJevAnswers(
  base: TestStrategyDecision,
  answers: Record<string, { choice?: string }>,
): TestStrategyDecision {
  const next: TestStrategyDecision = {
    ...base,
    unit: { ...base.unit },
    integration: { ...base.integration },
    e2e: { ...base.e2e },
    reasons: [...base.reasons],
  };
  const unitChoice = answers.unitRunner?.choice as RunnerId | undefined;
  if (unitChoice) {
    next.unit = {
      ...next.unit,
      runner: unitChoice,
      action: "use_existing",
      reasons: [`Jev chose existing ${unitChoice}`],
    };
    next.integration = { ...next.unit, testLevel: "integration" };
  }
  const e2eChoice = answers.e2eAction?.choice;
  if (e2eChoice === "not_applicable") {
    next.e2e = { ...next.e2e, runner: null, action: "not_applicable", reasons: ["Jev marked E2E as not applicable"] };
  } else if (e2eChoice?.startsWith("use_")) {
    const runner = e2eChoice.slice(4) as RunnerId;
    next.e2e = { ...next.e2e, runner, action: "use_existing", reasons: [`Jev chose existing ${runner}`] };
  } else if (e2eChoice === "install_appium") {
    next.e2e = { ...next.e2e, runner: "appium", action: "install", reasons: ["Jev chose Appium for mobile E2E"] };
  }
  next.reasons = [...next.unit.reasons, ...next.e2e.reasons];
  return next;
}

function rankCases(userCases: UserCase[], answers: Record<string, { choice?: string }>): UserCase[] {
  return userCases.map((userCase) => {
    const answer = answers[`uc_${safeKey(userCase.id)}`];
    if (answer?.choice === "critical") return { ...userCase, priority: "critical" as const };
    if (answer?.choice === "normal") return { ...userCase, priority: "normal" as const };
    return userCase;
  });
}

function discoveryState(discovery: ProjectDiscovery, userCases: UserCase[]): EvaluateState {
  return {
    ecosystem: discovery.ecosystem,
    language: discovery.language,
    packageManager: discovery.packageManager,
    browserApplication: discovery.browserApplication,
    mobileApplication: discovery.mobileApplication,
    cli: discovery.cli,
    runners: discovery.runners.map((runner) => `${runner.level}:${runner.id}`),
    userCases: userCases.map((userCase) => userCase.name),
  };
}

function safeKey(id: string) {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}
