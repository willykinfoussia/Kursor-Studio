import { isDesignApprovalReply } from "./approvalLanguage";

export interface QuestionChoice {
  id: string;
  label: string;
  description?: string;
}

const NO_REPLY = /^(?:no|non|deny)[.!]*$/i;
const ASK_USER_KEYS = new Set(["prompt", "options", "kind"]);
const EMBEDDED_OPTIONS_MARKUP = /<\/?\s*<?\s*(?:arg_key|arg_value|parameter)\b/i;

function parseOneChoice(item: unknown): QuestionChoice | null {
  if (typeof item === "string") {
    const label = item.trim();
    if (!label) return null;
    return { id: label, label };
  }
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const label = String(record.label ?? record.title ?? record.name ?? record.id ?? "").trim();
  const id = String(record.id ?? label).trim();
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!label && !id) return null;
  return {
    id: id || label,
    label: label || id,
    ...(description ? { description } : {}),
  };
}

function tryParseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function promptWithoutEmbeddedOptions(prompt: string): string {
  const markup = prompt.search(EMBEDDED_OPTIONS_MARKUP);
  if (markup >= 0) return prompt.slice(0, markup).trim();
  const bracket = prompt.indexOf("[");
  if (bracket > 0) {
    const json = tryParseJsonArray(prompt.slice(bracket));
    if (json && parseQuestionOptions(json).length > 0) {
      return prompt.slice(0, bracket).replace(/[<\s]+$/, "").trim();
    }
  }
  return prompt.trim();
}

function firstNonEmptyOptions(...candidates: unknown[]): unknown | undefined {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const parsed = parseQuestionOptions(candidate);
    if (parsed.length > 0) return Array.isArray(candidate) ? candidate : parsed;
  }
  return undefined;
}

/** Extra XML keys may be the string "options"; only arrays / JSON arrays count. */
function coerceJsonOrArrayOptions(...candidates: unknown[]): unknown | undefined {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && parseQuestionOptions(candidate).length > 0) return candidate;
    if (typeof candidate === "string") {
      const json = tryParseJsonArray(candidate);
      if (json && parseQuestionOptions(json).length > 0) return json;
    }
  }
  return undefined;
}

/** Accepts strings, `{ label, description }`, or `{ id, label, description }`. */
export function parseQuestionOptions(value: unknown): QuestionChoice[] {
  if (Array.isArray(value)) {
    return value.map(parseOneChoice).filter((item): item is QuestionChoice => Boolean(item));
  }
  if (typeof value === "string" && value.trim()) {
    const json = tryParseJsonArray(value);
    if (json) {
      return json.map(parseOneChoice).filter((item): item is QuestionChoice => Boolean(item));
    }
    return value.split(",").map((item) => parseOneChoice(item.trim())).filter((item): item is QuestionChoice => Boolean(item));
  }
  return [];
}

/**
 * Recover prompt + options when the model stuffs XML/JSON into prompt or extra keys.
 * Drops unknown properties so additionalProperties:false validation can succeed.
 */
export function normalizeAskUserQuestionInput(input: unknown): Record<string, unknown> {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? { ...(input as Record<string, unknown>) }
    : {};
  const extras = Object.entries(record)
    .filter(([key]) => !ASK_USER_KEYS.has(key))
    .map(([, value]) => value);
  const rawPrompt = typeof record.prompt === "string" ? record.prompt : String(record.prompt ?? "");
  const fromPrompt = tryParseJsonArray(rawPrompt);
  const options = firstNonEmptyOptions(record.options)
    ?? coerceJsonOrArrayOptions(fromPrompt, ...extras);
  const normalized: Record<string, unknown> = {
    prompt: promptWithoutEmbeddedOptions(rawPrompt),
  };
  if (options !== undefined) normalized.options = options;
  if (record.kind !== undefined) normalized.kind = record.kind;
  return normalized;
}

export function questionChoiceLabels(choices: readonly QuestionChoice[]): string[] {
  return choices.map((choice) => choice.label);
}

export function isYesNoQuestionOptions(choices: readonly QuestionChoice[]): boolean {
  if (choices.length === 0) return true;
  return choices.every((choice) => {
    const label = choice.label.trim();
    const id = choice.id.trim();
    return isDesignApprovalReply(label) || isDesignApprovalReply(id) || NO_REPLY.test(label) || NO_REPLY.test(id);
  });
}

export function matchedQuestionChoice(
  choices: readonly QuestionChoice[],
  selected: string,
): QuestionChoice | undefined {
  const needle = selected.trim();
  if (!needle) return undefined;
  return choices.find((choice) => choice.id === needle || choice.label === needle);
}

function choiceIsDesignYes(choice: QuestionChoice): boolean {
  return isDesignApprovalReply(choice.label) || isDesignApprovalReply(choice.id);
}

export function shouldApproveDesignFromQuestion(
  kind: string | undefined,
  choices: readonly QuestionChoice[],
  selected: string,
): boolean {
  if (kind !== "design") return false;
  const choice = matchedQuestionChoice(choices, selected);
  if (choice) return choiceIsDesignYes(choice);
  if (isYesNoQuestionOptions(choices)) return isDesignApprovalReply(selected);
  return false;
}

export function isUserQuestionStep(stepId: string | undefined): boolean {
  return stepId === "question" || stepId === "design" || stepId === "plan";
}
