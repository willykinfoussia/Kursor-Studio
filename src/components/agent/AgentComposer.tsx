import { useEffect, useMemo, useRef, useState } from "react";
import { File, Paperclip, Send, Square } from "lucide-react";
import { IconButton } from "../ui/Controls";
import { skillRegistry } from "../../lib/agent/skills/SkillRegistry";
import type { SkillDefinition } from "../../lib/agent/skills/types";
import { modePlaceholder, type AgentInteractionMode } from "../../lib/agent/modes";
import { activeAtQuery, formatFileMention } from "../../lib/agent/context/tokens";
import { fileName } from "../../lib/filesystem/pathUtils";
import { fileSystemService } from "../../lib/filesystem/FileSystemService";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { AgentModePicker } from "./AgentModePicker";

interface FileHit {
  name: string;
  relativePath: string;
}

const NO_FILES: FileHit[] = [];

function slashPrefix(value: string): string | null {
  const line = value.split("\n")[0] ?? "";
  if (!line.startsWith("/")) return null;
  if (/\s/.test(line.slice(1))) return null;
  return line.slice(1).toLowerCase();
}

function dedupeFiles(files: FileHit[]): FileHit[] {
  const seen = new Set<string>();
  const next: FileHit[] = [];
  for (const file of files) {
    const relativePath = file.relativePath.replace(/\\/g, "/");
    if (!relativePath || seen.has(relativePath)) continue;
    seen.add(relativePath);
    next.push({ name: file.name || fileName(relativePath), relativePath });
  }
  return next;
}

function rankFiles(files: FileHit[], query: string): FileHit[] {
  const needle = query.trim().toLowerCase();
  const score = (file: FileHit) => {
    const name = file.name.toLowerCase();
    const path = file.relativePath.toLowerCase();
    if (name.startsWith(needle)) return 0;
    if (name.includes(needle)) return 1;
    if (path.startsWith(needle)) return 2;
    return 3;
  };
  return [...files].sort((left, right) => {
    const delta = score(left) - score(right);
    if (delta !== 0) return delta;
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function openAndKnownFiles(): FileHit[] {
  const open = useEditorStore.getState().tabs
    .filter((tab) => tab.path && !tab.binary)
    .map((tab) => ({ name: tab.name || fileName(tab.path), relativePath: tab.path }));
  const known = useFileExplorerStore.getState().knownFiles()
    .filter((entry) => entry.kind === "file")
    .map((entry) => ({ name: entry.name, relativePath: entry.relativePath }));
  return dedupeFiles([...open, ...known]);
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
  const fileOptions = useRef<Array<HTMLButtonElement | null>>([]);
  const [catalog, setCatalog] = useState<SkillDefinition[]>([]);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState(0);
  const [fileResults, setFileResults] = useState<FileHit[]>([]);
  const [listedQuery, setListedQuery] = useState("");
  const [fileActive, setFileActive] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const openTabs = useEditorStore((state) => state.tabs);
  const explorerFiles = useFileExplorerStore((state) => state.files);
  const prefix = slashPrefix(value);
  const fileQuery = activeAtQuery(value, caret);
  const showFiles = fileQuery !== null && !mentionDismissed;

  useEffect(() => {
    if (!value) setCaret(0);
  }, [value]);

  useEffect(() => {
    setMentionDismissed(false);
  }, [fileQuery?.start, fileQuery?.query]);

  useEffect(() => {
    if (prefix === null || showFiles) {
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
  }, [prefix, showFiles]);

  const mentionQuery = fileQuery?.query;
  const mentionStart = fileQuery?.start;
  const readyFiles = fileQuery && listedQuery === fileQuery.query.trim() ? fileResults : NO_FILES;

  useEffect(() => {
    if (mentionQuery == null) {
      setFileResults([]);
      setListedQuery("");
      return;
    }
    if (mentionQuery.trim()) return;
    setListedQuery("");
    setFileResults(openAndKnownFiles().slice(0, 20));
    setFileActive(0);
  }, [mentionQuery, mentionStart, openTabs, explorerFiles]);

  useEffect(() => {
    const query = mentionQuery?.trim() ?? "";
    if (!query) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const apply = (entries: FileHit[]) => {
        if (cancelled) return;
        setListedQuery(query);
        setFileResults(entries.slice(0, 20));
        setFileActive(0);
      };
      void fileSystemService.searchProjectFiles(query).then((found) => {
        const files = found
          .filter((entry) => entry.kind === "file")
          .map((entry) => ({ name: entry.name, relativePath: entry.relativePath }));
        apply(rankFiles(dedupeFiles(files), query));
      }).catch(() => {
        const local = fileSystemService.searchFiles(query, useFileExplorerStore.getState().knownFiles())
          .map((entry) => ({ name: entry.name, relativePath: entry.relativePath }));
        apply(rankFiles(dedupeFiles(local), query));
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionQuery, mentionStart]);

  useEffect(() => {
    fileOptions.current[fileActive]?.scrollIntoView({ block: "nearest" });
  }, [fileActive, readyFiles]);

  const suggestions = useMemo(() => {
    if (prefix === null || showFiles) return [];
    return catalog.filter((skill) => (
      skill.id.toLowerCase().startsWith(prefix)
      || skill.name.toLowerCase().startsWith(prefix)
    ));
  }, [catalog, prefix, showFiles]);

  const resize = () => {
    if (!textarea.current) return;
    textarea.current.style.height = "0";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, compact ? 52 : 110)}px`;
  };

  const syncCaret = (node: HTMLTextAreaElement) => {
    setCaret(node.selectionStart ?? 0);
  };

  const insertSkill = (id: string) => {
    onChange(`/${id} `);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      resize();
    });
  };

  const insertFile = (relativePath: string) => {
    const node = textarea.current;
    const mention = activeAtQuery(value, node?.selectionStart ?? caret);
    if (!mention) return;
    const token = `${formatFileMention(relativePath)} `;
    const end = Math.max(mention.end, node?.selectionEnd ?? mention.end);
    const next = `${value.slice(0, mention.start)}${token}${value.slice(end)}`;
    const pos = mention.start + token.length;
    onChange(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      const field = textarea.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(pos, pos);
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
      {showFiles && (
        <ul className="skill-suggest-menu" role="listbox" aria-label="Fichiers">
          {readyFiles.map((file, index) => (
            <li key={file.relativePath}>
              <button
                type="button"
                role="option"
                ref={(element) => { fileOptions.current[index] = element; }}
                aria-selected={index === fileActive}
                className={`skill-suggest-item${index === fileActive ? " active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertFile(file.relativePath);
                }}
              >
                <span className="skill-suggest-id file-suggest-name">
                  <File size={13} />
                  {file.name}
                </span>
                <span className="skill-suggest-desc">{file.relativePath}</span>
              </button>
            </li>
          ))}
          {readyFiles.length === 0 && <li className="skill-suggest-empty">Aucun fichier</li>}
        </ul>
      )}
      {!showFiles && suggestions.length > 0 && (
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
            syncCaret(event.target);
            resize();
          }}
          onSelect={(event) => syncCaret(event.currentTarget)}
          onKeyUp={(event) => syncCaret(event.currentTarget)}
          onClick={(event) => syncCaret(event.currentTarget)}
          onKeyDown={(event) => {
            if (showFiles && event.key === "Escape") {
              event.preventDefault();
              setMentionDismissed(true);
              return;
            }
            if (showFiles && readyFiles.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setFileActive((current) => {
                if (event.key === "ArrowDown") return (current + 1) % readyFiles.length;
                return (current - 1 + readyFiles.length) % readyFiles.length;
              });
              return;
            }
            if (event.key === "Tab" && event.shiftKey) {
              event.preventDefault();
              onCycleMode?.();
              return;
            }
            if (showFiles && readyFiles.length > 0 && event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const file = readyFiles[fileActive] ?? readyFiles[0];
              if (file) insertFile(file.relativePath);
              return;
            }
            if (showFiles && readyFiles.length > 0 && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
              event.preventDefault();
              const file = readyFiles[fileActive] ?? readyFiles[0];
              if (file) insertFile(file.relativePath);
              return;
            }
            if (!showFiles && suggestions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setActive((current) => {
                if (event.key === "ArrowDown") return (current + 1) % suggestions.length;
                return (current - 1 + suggestions.length) % suggestions.length;
              });
              return;
            }
            if (!showFiles && suggestions.length > 0 && event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const skill = suggestions[active] ?? suggestions[0];
              if (skill) insertSkill(skill.id);
              return;
            }
            if (!showFiles && suggestions.length > 0 && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
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
