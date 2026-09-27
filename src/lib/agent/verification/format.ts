export type VerificationPhase = "idle" | "launching" | "running" | "approval" | "finished" | "stopped" | "error";

export function verificationPhaseLabel(phase: VerificationPhase): string | null {
  if (phase === "launching") return "Launching…";
  if (phase === "running") return "Running…";
  if (phase === "approval") return "Waiting for approval";
  if (phase === "finished") return "Finished";
  if (phase === "stopped") return "Stopped";
  if (phase === "error") return "Could not start";
  return null;
}

export function formatDuration(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

export function formatRelative(timestamp?: number | null, now = Date.now()): string | null {
  if (!timestamp) return null;
  const delta = Math.max(0, now - timestamp);
  if (delta < 15_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function formatClock(timestamp?: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString();
}
