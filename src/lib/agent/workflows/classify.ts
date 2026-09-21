import type { TaskComplexity } from "./types";

const COMPLEX_SIGNAL = /\b(oauth|authentification|authentication|architecture|multi-tenant)\b/i;
const COMPLEX_MIGRATE = /\bmigrat/i;
const ADD_FEATURE = /\b(ajoute|ajouter|add|implement|implémente|implementer)\b/i;
const LARGE_DOMAIN = /\b(auth|login|oauth|payment|billing|permission|rbac|realtime|websocket|graphql)\b/i;
const SIMPLE_SIGNAL = /\b(renomm(?:e|er)|rename|typo|variable)\b/i;
const DEBUG_SIGNAL = /\b(crash|exception|stack\s*trace|failing tests?|tests? fail|bug|reprodu(?:ce|ire|is)|ne marche pas|doesn't work|does not work|panic)\b/i;

export function classifyTask(goal: string): TaskComplexity {
  const text = goal.trim();
  if (!text) return "simple";
  const lowered = text.toLowerCase();
  if (isComplexGoal(lowered)) return "complex";
  if (isSimpleGoal(lowered, text)) return "simple";
  return "medium";
}

export function isDebugGoal(goal: string): boolean {
  return DEBUG_SIGNAL.test(goal);
}

function isComplexGoal(text: string) {
  if (COMPLEX_SIGNAL.test(text) || COMPLEX_MIGRATE.test(text)) return true;
  return ADD_FEATURE.test(text) && LARGE_DOMAIN.test(text);
}

function isSimpleGoal(lowered: string, original: string) {
  if (SIMPLE_SIGNAL.test(lowered)) return true;
  const tokens = original.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 6 && !ADD_FEATURE.test(lowered) && !LARGE_DOMAIN.test(lowered)) return true;
  return false;
}
