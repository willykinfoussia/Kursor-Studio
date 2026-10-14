import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { formatContextTokens, type ContextUsage as ContextUsageSnapshot } from "../../lib/agent/context/usage";
import { useAgentStore } from "../../stores/agentStore";

const RING_RADIUS = 6.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ContextUsage() {
  const conversationId = useAgentStore((state) => state.activeConversationId);
  const usage = useAgentStore((state) => state.contextUsages[conversationId] ?? null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const ratio = usage && usage.maxTokens > 0 ? usage.tokensUsed / usage.maxTokens : 0;
  const percent = Math.round(ratio * 100);
  const arc = Math.min(Math.max(ratio, 0), 1);

  return (
    <div className="context-usage" ref={root}>
      <button
        type="button"
        className="context-usage-ring"
        aria-label={`Context usage ${percent}%`}
        aria-expanded={open}
        aria-controls={open ? `${titleId}-panel` : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
          <circle className="context-usage-track" cx="9" cy="9" r={RING_RADIUS} />
          <circle
            className="context-usage-fill"
            cx="9"
            cy="9"
            r={RING_RADIUS}
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - arc)}
          />
        </svg>
      </button>
      {open && (
        <div className="context-usage-panel" id={`${titleId}-panel`} role="dialog" aria-labelledby={titleId}>
          <header className="context-usage-head">
            <span id={titleId}>Context Usage</span>
            <button type="button" className="context-usage-close" aria-label="Close context usage" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </header>
          {usage ? <UsageBody usage={usage} percent={percent} /> : (
            <p className="context-usage-empty">No context assembled yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function UsageBody({ usage, percent }: { usage: ContextUsageSnapshot; percent: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const usedShare = usage.tokensUsed > 0 ? Math.min(percent, 100) : 0;

  return (
    <>
      <div className="context-usage-summary">
        <strong>{percent}% Full</strong>
        <span>~{formatContextTokens(usage.tokensUsed)} / {formatContextTokens(usage.maxTokens)} Tokens</span>
      </div>
      <div className="context-usage-bar" aria-hidden="true">
        <div className="context-usage-bar-fill" style={{ width: `${usedShare}%` }}>
          {usage.groups.map((group) => (
            <span
              key={group.id}
              style={{
                width: usage.tokensUsed > 0 ? `${(group.tokens / usage.tokensUsed) * 100}%` : "0%",
                background: group.color,
              }}
            />
          ))}
        </div>
      </div>
      <ul className="context-usage-groups">
        {usage.groups.map((group) => {
          const isOpen = expanded === group.id;
          return (
            <li key={group.id}>
              <button
                type="button"
                className="context-usage-group"
                aria-expanded={isOpen}
                onClick={() => {
                  setExpanded(isOpen ? null : group.id);
                  setSelected(null);
                }}
              >
                <ChevronRight size={13} className={isOpen ? "context-usage-chevron open" : "context-usage-chevron"} />
                <span className="context-usage-swatch" style={{ background: group.color }} />
                <span className="context-usage-label">{group.label}</span>
                <span className="context-usage-tokens">{formatContextTokens(group.tokens)}</span>
              </button>
              {isOpen && (
                <ul className="context-usage-items">
                  {group.items.map((item) => {
                    const showing = selected === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`context-usage-item${showing ? " open" : ""}`}
                          aria-expanded={showing}
                          onClick={() => setSelected(showing ? null : item.id)}
                        >
                          <span className="context-usage-label">{item.label}</span>
                          <span className="context-usage-tokens">{formatContextTokens(item.tokens)}</span>
                        </button>
                        {showing && <pre className="context-usage-text">{item.text}</pre>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
