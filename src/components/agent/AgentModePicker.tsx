import { useEffect, useRef, useState } from "react";
import { Bug, Check, ChevronDown, Infinity as InfinityIcon, ListTodo, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AGENT_INTERACTION_MODES,
  MODE_LABELS,
  type AgentInteractionMode,
} from "../../lib/agent/modes";

const MODE_ICONS: Record<AgentInteractionMode, LucideIcon> = {
  agent: InfinityIcon,
  plan: ListTodo,
  debug: Bug,
  ask: MessageCircle,
};

export function AgentModePicker({
  mode,
  onChange,
}: {
  mode: AgentInteractionMode;
  onChange: (mode: AgentInteractionMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const CurrentIcon = MODE_ICONS[mode];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mode-picker" ref={root}>
      <button
        type="button"
        className={`mode-picker-btn mode-${mode}${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Mode ${MODE_LABELS[mode]}`}
        onClick={() => setOpen((value) => !value)}
      >
        <CurrentIcon size={13} strokeWidth={2} />
        <span>{MODE_LABELS[mode]}</span>
        <ChevronDown size={12} className="mode-picker-chevron" />
      </button>
      {open && (
        <div className="mode-picker-menu" role="listbox" aria-label="Agent mode">
          {AGENT_INTERACTION_MODES.map((item) => {
            const Icon = MODE_ICONS[item];
            const selected = item === mode;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={selected}
                className={`context-item mode-picker-option mode-${item}${selected ? " active" : ""}`}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <Icon size={14} strokeWidth={1.8} />
                <span>{MODE_LABELS[item]}</span>
                {selected ? <Check size={12} className="mode-picker-check" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
