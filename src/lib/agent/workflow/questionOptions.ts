import type { TurnReply } from "../workflows/turnClassifier";
import { explicitDesignYes } from "./approvalLanguage";

export interface QuestionChoice {
  id: string;
  label: string;
  description?: string;
}

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

export interface MatrixRow {
  n: number;
  title: string;
  choices: QuestionChoice[];
}

export interface MatrixQuestion {
  intro: string;
  rows: MatrixRow[];
}

const MATRIX_ROW_HEAD = /^\s*(\d+)\.\s+(.+)$/;
const MATRIX_LETTER = /^\s*(?:[-*+]\s*)?([A-Z])\s*[:.)]\s+(.+)$/;
const MATRIX_TOKEN = /^(\d+)([A-Z])$/i;

/**
 * Numbered rows with lettered choices (`1. Title:` then `- A: …`).
 * Returns null unless there are at least two rows and two letters on each row.
 */
export function parseMatrixQuestion(prompt: string): MatrixQuestion | null {
  const intro: string[] = [];
  const rows: MatrixRow[] = [];
  let current: MatrixRow | null = null;
  let seenRow = false;

  const close = () => {
    if (!current) return;
    rows.push(current);
    current = null;
  };

  for (const line of prompt.split(/\r?\n/)) {
    const head = line.match(MATRIX_ROW_HEAD);
    if (head) {
      close();
      seenRow = true;
      const title = head[2].replace(/:\s*$/, "").trim();
      if (!title) return null;
      current = { n: Number(head[1]), title, choices: [] };
      continue;
    }
    const letter = line.match(MATRIX_LETTER);
    if (seenRow && current && letter) {
      const id = letter[1].toUpperCase();
      const label = letter[2].trim();
      if (!label || current.choices.some((choice) => choice.id === id)) return null;
      current.choices.push({ id, label });
      continue;
    }
    if (!seenRow) {
      const trimmed = line.trim();
      if (trimmed) intro.push(trimmed);
    }
  }
  close();
  if (rows.length < 2 || rows.some((row) => row.choices.length < 2)) return null;
  return { intro: intro.join("\n"), rows };
}

/** `1C 2A` from a letter picked on each row. Null while a row is still open. */
export function formatMatrixSelection(
  rows: readonly MatrixRow[],
  picks: Readonly<Record<number, string>>,
): string | null {
  const parts: string[] = [];
  for (const row of rows) {
    const letter = picks[row.n]?.trim().toUpperCase();
    if (!letter || !row.choices.some((choice) => choice.id === letter)) return null;
    parts.push(`${row.n}${letter}`);
  }
  return parts.join(" ");
}

/** Row number to letter, when `selected` is a complete matrix code. */
export function matrixRowPicks(
  rows: readonly MatrixRow[],
  selected: string,
): Record<number, string> | null {
  const tokens = selected.trim().split(/\s+/);
  if (tokens.length !== rows.length) return null;
  const picks: Record<number, string> = {};
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const token = tokens[index]?.match(MATRIX_TOKEN);
    if (!row || !token || Number(token[1]) !== row.n) return null;
    const letter = token[2].toUpperCase();
    if (!row.choices.some((choice) => choice.id === letter)) return null;
    picks[row.n] = letter;
  }
  return picks;
}

/** One readable design note per row, or [] when `selected` is not a matrix code. */
export function expandMatrixSelection(prompt: string, selected: string): string[] {
  const matrix = parseMatrixQuestion(prompt);
  if (!matrix) return [];
  const picks = matrixRowPicks(matrix.rows, selected);
  if (!picks) return [];
  return matrix.rows.map((row) => {
    const letter = picks[row.n];
    const choice = row.choices.find((item) => item.id === letter);
    return `${row.title}: ${choice?.label ?? letter}`;
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

export function shouldApproveDesignFromQuestion(
  kind: string | undefined,
  choices: readonly QuestionChoice[],
  selected: string,
  reply: TurnReply,
): boolean {
  if (kind !== "design" || reply === "design_no") return false;
  const choice = matchedQuestionChoice(choices, selected);
  if (!choice) return false;
  if (reply === "design_yes") return true;
  return explicitDesignYes(choice.label) || explicitDesignYes(choice.id);
}

export function isUserQuestionStep(stepId: string | undefined): boolean {
  return stepId === "question" || stepId === "design" || stepId === "plan";
}
