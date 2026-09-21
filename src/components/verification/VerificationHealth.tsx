import type { VerificationHealth } from "../../lib/agent/verification/types";

const COPY: Record<VerificationHealth, { title: string; detail: string }> = {
  verified: { title: "VERIFIED", detail: "All checks passed" },
  failed: { title: "FAILED", detail: "Verification failed" },
  blocked: { title: "BLOCKED", detail: "A required check was denied" },
  running: { title: "RUNNING", detail: "Verification running" },
  cancelled: { title: "NOT VERIFIED", detail: "Verification was stopped" },
  "not-verified": { title: "NOT VERIFIED", detail: "Verification required" },
};

export function VerificationHealth({ health }: { health: VerificationHealth }) {
  const copy = COPY[health];
  return (
    <section className={`verify-health health-${health}`} aria-live="polite">
      <span className="verify-health-mark" aria-hidden="true">{mark(health)}</span>
      <div>
        <p className="verify-health-title">{copy.title}</p>
        <p className="verify-health-detail">{copy.detail}</p>
      </div>
    </section>
  );
}

function mark(health: VerificationHealth) {
  if (health === "verified") return "●";
  if (health === "failed" || health === "blocked") return "✕";
  if (health === "running") return "⏳";
  return "⚠";
}
