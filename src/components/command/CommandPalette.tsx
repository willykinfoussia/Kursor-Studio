import { useEffect, useMemo, useState } from "react";
import { APP_COMMANDS } from "../../lib/commands/appCommands";
import { useUiStore } from "../../stores/uiStore";

export function CommandPalette() {
  const open = useUiStore((state) => state.commandPalette);
  const setOpen = useUiStore((state) => state.setCommandPalette);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const commands = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return APP_COMMANDS
      .filter((command) => command.showInPalette !== false)
      .filter((command) => !needle || command.label.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  if (!open) return null;

  const active = commands.length === 0 ? 0 : Math.min(index, commands.length - 1);

  const choose = (id: string) => {
    APP_COMMANDS.find((command) => command.id === id)?.run();
    setOpen(false);
  };

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette-card" onClick={(event) => event.stopPropagation()}>
        <div className="palette-title">Command Palette</div>
        <input
          className="palette-input"
          autoFocus
          value={query}
          placeholder="Save All, Git, Settings…"
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((value) => Math.min(commands.length - 1, value + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((value) => Math.max(0, value - 1));
            }
            if (event.key === "Enter" && commands[active]) {
              event.preventDefault();
              choose(commands[active]!.id);
            }
          }}
        />
        <div className="palette-list">
          {commands.map((command, offset) => (
            <button
              type="button"
              key={command.id}
              className={`palette-item ${offset === active ? "active" : ""}`}
              onClick={() => choose(command.id)}
            >
              <strong>{command.label}</strong>
              {command.shortcut && <span className="palette-shortcut">{command.shortcut}</span>}
            </button>
          ))}
          {commands.length === 0 && <div className="palette-empty">No matching commands.</div>}
        </div>
      </div>
    </div>
  );
}
