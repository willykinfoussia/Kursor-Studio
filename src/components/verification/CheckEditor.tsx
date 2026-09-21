import { useEffect, useState } from "react";
import type { CheckToggle, CustomCheck, ProfileInspection, StandardCheckKind, VerificationProfile } from "../../lib/agent/verification/types";
import { STANDARD_CHECK_KINDS, compactOverlay, labelForKind, overlayFromInspection, overlayUnknownKeys, sanitizeOverlay } from "../../lib/agent/verification";

export function CheckEditor({
  inspection,
  onSave,
  onClose,
}: {
  inspection: ProfileInspection;
  onSave: (overlay: VerificationProfile) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [toggles, setToggles] = useState<Partial<Record<StandardCheckKind, "auto" | "custom" | "disabled">>>({});
  const [commands, setCommands] = useState<Partial<Record<StandardCheckKind, string>>>({});
  const [custom, setCustom] = useState<CustomCheck[]>(inspection.overlay.custom ?? []);
  const [expectedFiles, setExpectedFiles] = useState<string[]>(inspection.overlay.expectedFiles ?? []);
  const [json, setJson] = useState(JSON.stringify(inspection.overlay, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextToggles: Partial<Record<StandardCheckKind, "auto" | "custom" | "disabled">> = {};
    const nextCommands: Partial<Record<StandardCheckKind, string>> = {};
    for (const check of inspection.checks) {
      nextToggles[check.kind] = check.origin === "disabled" ? "disabled" : check.origin === "custom" ? "custom" : "auto";
      nextCommands[check.kind] = typeof check.overlay === "string" ? check.overlay : check.autoCommand ?? "";
    }
    setToggles(nextToggles);
    setCommands(nextCommands);
    setCustom(inspection.overlay.custom ?? []);
    setExpectedFiles(inspection.overlay.expectedFiles ?? []);
    setJson(JSON.stringify(inspection.overlay, null, 2));
  }, [inspection]);

  const save = () => {
    if (mode === "advanced") {
      try {
        const parsed = JSON.parse(json) as unknown;
        const unknown = overlayUnknownKeys(parsed);
        if (unknown.length > 0) {
          setError(`Unknown keys: ${unknown.join(", ")}`);
          return;
        }
        const overlay = sanitizeOverlay(parsed);
        if (!overlay) {
          setError("JSON must be a verification profile object.");
          return;
        }
        onSave(overlay);
      } catch {
        setError("Invalid JSON.");
      }
      return;
    }
    const next: Partial<Record<StandardCheckKind, CheckToggle | undefined>> = {};
    for (const kind of STANDARD_CHECK_KINDS) {
      const modeFor = toggles[kind] ?? "auto";
      if (modeFor === "disabled") next[kind] = false;
      else if (modeFor === "custom") next[kind] = commands[kind]?.trim() || false;
      else next[kind] = undefined;
    }
    onSave(compactOverlay(overlayFromInspection(inspection, { toggles: next, custom, expectedFiles })));
  };

  return (
    <div className="verify-modal-backdrop" onClick={onClose}>
      <div className="verify-modal" role="dialog" aria-labelledby="verify-editor-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="verify-editor-title">Project verification configuration</h2>
        <p className="verify-muted">Persistent overlay: .kursor/verify.json</p>
        <p className="verify-detected">Detected from project · {inspection.detectedFrom.join(", ") || inspection.ecosystem}</p>
        <div className="verify-tabs" role="tablist">
          <button type="button" className={mode === "simple" ? "active" : ""} onClick={() => setMode("simple")}>Simple</button>
          <button type="button" className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")}>Advanced</button>
        </div>
        {mode === "simple" ? (
          <div className="verify-editor-body">
            {STANDARD_CHECK_KINDS.map((kind) => (
              <fieldset key={kind} className="verify-check-edit">
                <legend>{labelForKind(kind)}</legend>
                <label><input type="radio" name={kind} checked={(toggles[kind] ?? "auto") === "auto"} onChange={() => setToggles((current) => ({ ...current, [kind]: "auto" }))} /> Use auto-detected command</label>
                <label><input type="radio" name={kind} checked={toggles[kind] === "custom"} onChange={() => setToggles((current) => ({ ...current, [kind]: "custom" }))} /> Custom command</label>
                <label><input type="radio" name={kind} checked={toggles[kind] === "disabled"} onChange={() => setToggles((current) => ({ ...current, [kind]: "disabled" }))} /> Disabled</label>
                {toggles[kind] === "custom" && (
                  <input value={commands[kind] ?? ""} onChange={(event) => setCommands((current) => ({ ...current, [kind]: event.target.value }))} aria-label={`${kind} command`} />
                )}
                {toggles[kind] === "auto" && <p className="verify-muted">{inspection.checks.find((check) => check.kind === kind)?.autoCommand ?? "No auto-detected command"}</p>}
              </fieldset>
            ))}
            <h3>Custom checks</h3>
            {custom.map((item, index) => (
              <div className="verify-custom-row" key={`${item.name}-${index}`}>
                <input value={item.name} onChange={(event) => setCustom((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} aria-label="Check name" />
                <input value={item.command} onChange={(event) => setCustom((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, command: event.target.value } : row))} aria-label="Check command" />
                <button type="button" onClick={() => setCustom((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
              </div>
            ))}
            <button type="button" className="cap-filter-btn" onClick={() => setCustom((current) => [...current, { name: "", command: "" }])}>+ Add custom check</button>
            <h3>Expected files</h3>
            {expectedFiles.map((path, index) => (
              <div className="verify-custom-row" key={`${path}-${index}`}>
                <input value={path} onChange={(event) => setExpectedFiles((current) => current.map((row, rowIndex) => rowIndex === index ? event.target.value : row))} aria-label="Expected file" />
                <button type="button" onClick={() => setExpectedFiles((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
              </div>
            ))}
            <button type="button" className="cap-filter-btn" onClick={() => setExpectedFiles((current) => [...current, ""])}>+ Add expected file</button>
          </div>
        ) : (
          <textarea className="verify-json" value={json} onChange={(event) => setJson(event.target.value)} aria-label="verify.json" />
        )}
        {error && <p className="verify-error">{error}</p>}
        <div className="verify-modal-actions">
          <button type="button" className="cap-filter-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function AddCheckDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (kind: "custom" | "file", value: { name?: string; command?: string; path?: string }) => void;
}) {
  const [kind, setKind] = useState<"custom" | "file">("custom");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [path, setPath] = useState("");
  return (
    <div className="verify-modal-backdrop" onClick={onClose}>
      <div className="verify-modal" role="dialog" aria-labelledby="add-check-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="add-check-title">Add check</h2>
        <label><input type="radio" checked={kind === "custom"} onChange={() => setKind("custom")} /> Custom command</label>
        <label><input type="radio" checked={kind === "file"} onChange={() => setKind("file")} /> Expected file</label>
        {kind === "custom" ? (
          <>
            <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Command<input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="pnpm e2e" /></label>
          </>
        ) : (
          <label>Path<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="src/index.ts" /></label>
        )}
        <div className="verify-modal-actions">
          <button type="button" className="cap-filter-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onAdd(kind, { name, command, path })}
            disabled={kind === "custom" ? !command.trim() : !path.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
