import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function toErrorMessage(error: unknown, fallback = "The desktop command failed."): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
  }
  return fallback;
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
  browserFallback?: T,
): Promise<T> {
  if (!isTauri()) {
    if (browserFallback !== undefined) return browserFallback;
    throw new Error(`Native command "${command}" requires the Kursor desktop runtime.`);
  }
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    throw new Error(toErrorMessage(error, `Native command "${command}" failed.`));
  }
}
