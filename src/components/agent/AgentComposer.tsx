import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, Square } from "lucide-react";
import { IconButton } from "../ui/Controls";
import { skillRegistry } from "../../lib/agent/skills/SkillRegistry";
import type { SkillDefinition } from "../../lib/agent/skills/types";
import { modePlaceholder, type AgentInteractionMode } from "../../lib/agent/modes";
import { AgentModePicker } from "./AgentModePicker";

function slashPrefix(value: string): string | null {
  const line = value.split("\n")[0] ?? "";
  if (!line.startsWith("/")) return null;
  if (/\s/.test(line.slice(1))) return null;
  return line.slice(1).toLowerCase();
}

export function AgentComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  compact,
  hidden,
  approvalPending,
  agentMode = "agent",
  onSetMode,
  onCycleMode,
  onBuildPlan,
  canBuildPlan = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  compact?: boolean;
  hidden?: boolean;
  approvalPending?: boolean;
  agentMode?: AgentInteractionMode;
  onSetMode?: (mode: AgentInteractionMode) => void;
  onCycleMode?: () => void;
  onBuildPlan?: () => void;
  canBuildPlan?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [catalog, setCatalog] = useState<SkillDefinition[]>([]);
  const [active, setActive] = useState(0);
  const prefix = slashPrefix(value);

  useEffect(() => {
    if (prefix === null) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    void skillRegistry.listDefinitions().then((skills) => {
      if (cancelled) return;
      setCatalog(skills.filter((skill) => skill.enabled && skill.userInvocable));
      setActive(0);
    });
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  const suggestions = useMemo(() => {
    if (prefix === null) return [];
    return catalog.filter((skill) => (
      skill.id.toLowerCase().startsWith(prefix)
      || skill.name.toLowerCase().startsWith(prefix)
    ));
  }, [catalog, prefix]);

  const resize = () => {
    if (!textarea.current) return;
    textarea.current.style.height = "0";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, compact ? 52 : 110)}px`;
  };

  const insertSkill = (id: string) => {
    onChange(`/${id} `);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      resize();
    });
  };

  if (hidden) {
    return isStreaming ? (
      <div className="agent-input-wrap compact">
        <button className="stop-btn" type="button" onClick={onStop} aria-keyshortcuts="Control+Shift+C">
          <Square size={11} fill="currentColor" /> Stop Agent
        </button>
      </div>
    ) : null;
  }

  return (
    <div className={`agent-input-wrap${compact ? " compact" : ""}`}>
      {suggestions.length > 0 && (
        <ul className="skill-suggest-menu" role="listbox" aria-label="Skills">
          {suggestions.map((skill, index) => (
            <li key={skill.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`skill-suggest-item${index === active ? " active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertSkill(skill.id);
                }}
              >
                <span className="skill-suggest-id">/{skill.id}</span>
                <span className="skill-suggest-desc">{skill.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="agent-input-box">
        <textarea
          ref={textarea}
          className="agent-textarea"
          value={value}
          placeholder={modePlaceholder(agentMode)}
          rows={1}
          aria-label="Ask Kursor"
          aria-autocomplete="list"
          onChange={(event) => {
            onChange(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (suggestions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setActive((current) => {
                if (event.key === "ArrowDown") return (current + 1) % suggestions.length;
                return (current - 1 + suggestions.length) % suggestions.length;
              });
              return;
            }
            if (event.key === "Tab" && event.shiftKey) {
              event.preventDefault();
              onCycleMode?.();
              return;
            }
            if (suggestions.length > 0 && event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const skill = suggestions[active] ?? suggestions[0];
              if (skill) insertSkill(skill.id);
              return;
            }
            if (suggestions.length > 0 && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
              event.preventDefault();
              const skill = suggestions[active] ?? suggestions[0];
              if (skill) insertSkill(skill.id);
              return;
            }
            if (approvalPending && event.key === "Enter" && (event.ctrlKey || event.metaKey)) return;
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              if (!value.trim() && canBuildPlan && onBuildPlan && !isStreaming) {
                onBuildPlan();
                return;
              }
              onSend();
            }
          }}
        />
        <div className="input-actions">
          <AgentModePicker mode={agentMode} onChange={(mode) => onSetMode?.(mode)} />
          <IconButton icon={Paperclip} label="Joindre un fichier" size={14} />
          <span className="shortcut-hint">Ctrl ↵</span>
          {isStreaming ? (
            <button className="stop-btn" type="button" onClick={onStop} aria-keyshortcuts="Control+Shift+C">
              <Square size={11} fill="currentColor" /> Stop Agent
            </button>
          ) : (
            <button className="send-btn" type="button" aria-label="Send" disabled={!value.trim()} onClick={onSend}>
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
