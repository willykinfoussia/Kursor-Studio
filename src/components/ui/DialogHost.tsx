import { useEffect, useState } from "react";
import { useDialogStore } from "../../stores/dialogStore";
import { useEditorStore } from "../../stores/editorStore";
import { MCPSetupWizardModal } from "../mcp/MCPSetupWizardModal";
import { McpProjectTrustDialog } from "../mcp/McpProjectTrustDialog";

export function DialogHost() {
  const unsavedOpen = useDialogStore((state) => state.unsavedOpen);
  const resolveUnsaved = useDialogStore((state) => state.resolveUnsaved);
  const conflict = useDialogStore((state) => state.conflict);
  const confirm = useDialogStore((state) => state.confirm);
  const resolveConfirm = useDialogStore((state) => state.resolveConfirm);
  const prompt = useDialogStore((state) => state.prompt);
  const resolvePrompt = useDialogStore((state) => state.resolvePrompt);
  const keepLocalChanges = useEditorStore((state) => state.keepLocalChanges);
  const reloadConflict = useEditorStore((state) => state.reloadConflict);
  const [promptValue, setPromptValue] = useState("");

  useEffect(() => {
    if (prompt) setPromptValue(prompt.value);
  }, [prompt]);

  return (
    <>
      {unsavedOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>You have unsaved changes.</h3>
            <p>Save your edits before continuing, or discard them.</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn primary" onClick={() => resolveUnsaved("save")}>Save</button>
              <button type="button" className="modal-btn" onClick={() => resolveUnsaved("discard")}>Don't Save</button>
              <button type="button" className="modal-btn" onClick={() => resolveUnsaved("cancel")}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {conflict && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>External modification detected</h3>
            <p>{conflict.name} was modified externally.</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn" disabled title="Diff viewer is not available yet">Compare Changes</button>
              <button type="button" className="modal-btn primary" onClick={() => void reloadConflict()}>Reload from Disk</button>
              <button type="button" className="modal-btn" onClick={keepLocalChanges}>Keep Editor Version</button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>{confirm.title}</h3>
            <p>{confirm.message}</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={() => resolveConfirm(false)}>Cancel</button>
              <button type="button" className={`modal-btn ${confirm.danger ? "danger" : "primary"}`} onClick={() => resolveConfirm(true)}>{confirm.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
      {prompt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>{prompt.title}</h3>
            <input
              className="modal-input"
              autoFocus
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") resolvePrompt(promptValue);
                if (event.key === "Escape") resolvePrompt(null);
              }}
            />
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={() => resolvePrompt(null)}>Cancel</button>
              <button type="button" className="modal-btn primary" onClick={() => resolvePrompt(promptValue)}>OK</button>
            </div>
          </div>
        </div>
      )}
      <MCPSetupWizardModal />
      <McpProjectTrustDialog />
    </>
  );
}
