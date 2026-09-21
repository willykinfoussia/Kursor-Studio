import { AlertTriangle, Check, Circle, Loader2, RotateCw, X } from "lucide-react";
import type { WorkStatus } from "../../types/agent";

export type GlyphStatus = WorkStatus | "warning" | "retrying";

export function StatusGlyph({ status, label }: { status: GlyphStatus; label?: string }) {
  const title = label ?? status;
  if (status === "completed") return <Check size={13} className="status-glyph success" aria-label={title} />;
  if (status === "running") return <Loader2 size={13} className="status-glyph running" aria-label={title} />;
  if (status === "failed") return <X size={13} className="status-glyph error" aria-label={title} />;
  if (status === "warning") return <AlertTriangle size={13} className="status-glyph warning" aria-label={title} />;
  if (status === "retrying") return <RotateCw size={13} className="status-glyph warning" aria-label={title} />;
  return <Circle size={12} className="status-glyph pending" aria-label={title} />;
}
