import { isMutatingToolName } from "../AgentStep";
import { isPlanDocumentPath as isStructuredPlanDocumentPath } from "../plans/planFile";

/** Paths under .kursor/plans/ (and legacy docs/superpowers/plans/) are plan documents. */
export function isPlanDocumentPath(path: string): boolean {
  return isStructuredPlanDocumentPath(path);
}

export function pathFromToolInput(input: unknown): string {
  if (!input || typeof input !== "object" || !("path" in input)) return "";
  return String((input as { path?: unknown }).path ?? "");
}

export function trackedMutationPath(tool: string, input: unknown, mutate?: boolean): string {
  if (!isMutatingToolName(tool, mutate)) return "";
  return pathFromToolInput(input);
}

export function isPlanDocumentWrite(tool: string, input: unknown): boolean {
  if (tool !== "write_file" && tool !== "create_file") return false;
  return isPlanDocumentPath(pathFromToolInput(input));
}
