import { useEffect, useMemo, useRef, useState } from "react";
import { capabilityService } from "../../lib/capabilities/instance";
import {
  serializeSkill,
  shadowsBuiltin,
  SkillDocumentError,
  splitSkillList,
  skillDocuments,
  type SkillDocumentScope,
  type SkillDraftFile,
} from "../../lib/agent/skills/SkillDocument";
import {
  discoverSkillPacks,
  entriesFromDataTransfer,
  entriesFromFileList,
  packToDraft,
  type SkillPackSkill,
} from "../../lib/agent/skills/SkillPack";
import { pickSkillPackDirectory, readSkillPackDirectory } from "../../lib/tauri/skillPackApi";
import { isTauri } from "../../lib/tauri/invoke";
import { skillCapabilityId, parseSkillCapabilityId } from "../../lib/capabilities/ids";
import type { SkillCapability } from "../../lib/capabilities/types";

export type SkillEditorTarget = {
  mode: "create" | "edit";
  scope: SkillDocumentScope;
  skill?: SkillCapability;
};

function slugFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z]+/, "");
}

function fieldsFromSkill(skill: SkillCapability) {
  return {
    name: skill.displayName,
    description: skill.description ?? "",
    triggers: (skill.triggers ?? []).join(", "),
    allowedTools: (skill.allowedTools ?? []).join(", "),
    instructions: skill.instructions ?? "",
  };
}

export function SkillEditorDialog({
  target,
  onClose,
  onSaved,
}: {
  target: SkillEditorTarget;
  onClose: () => void;
  onSaved: (capabilityId: string) => void;
}) {
  const editing = target.mode === "edit";
  const parsedId = parseSkillCapabilityId(target.skill?.id ?? "")?.skillId ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState(editing ? parsedId : "");
  const [idTouched, setIdTouched] = useState(editing);
  const [name, setName] = useState(editing && target.skill ? target.skill.displayName : "");
  const [description, setDescription] = useState(editing && target.skill ? (target.skill.description ?? "") : "");
  const [triggers, setTriggers] = useState(editing && target.skill ? (target.skill.triggers ?? []).join(", ") : "");
  const [allowedTools, setAllowedTools] = useState(editing && target.skill ? (target.skill.allowedTools ?? []).join(", ") : "");
  const [instructions, setInstructions] = useState(editing && target.skill ? (target.skill.instructions ?? "") : "");
  const [files, setFiles] = useState<SkillDraftFile[]>([]);
  const [filesReady, setFilesReady] = useState(!editing);
  const [importedFlags, setImportedFlags] = useState({ disableModelInvocation: false, userInvocable: true });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setId("");
    setIdTouched(false);
    setName("");
    setDescription("");
    setTriggers("");
    setAllowedTools("");
    setInstructions("");
    setFiles([]);
    setFilesReady(true);
    setImportedFlags({ disableModelInvocation: false, userInvocable: true });
  };

  const applyPack = (pack: SkillPackSkill) => {
    const draft = packToDraft(pack);
    setId(draft.id);
    setIdTouched(true);
    setName(draft.name ?? draft.id);
    setDescription(draft.description ?? "");
    setTriggers((draft.triggers ?? []).join(", "));
    setAllowedTools((draft.allowedTools ?? []).join(", "));
    setInstructions(draft.instructions ?? "");
    setFiles([...(draft.files ?? [])]);
    setFilesReady(true);
    setImportedFlags({
      disableModelInvocation: Boolean(draft.disableModelInvocation),
      userInvocable: draft.userInvocable !== false,
    });
    setNotice(draft.files?.length
      ? `Imported ${draft.id} with ${draft.files.length} supporting file${draft.files.length === 1 ? "" : "s"}.`
      : `Imported ${draft.id}.`);
  };

  useEffect(() => {
    setError("");
    setNotice("");
    if (!editing || !parsedId) {
      resetForm();
      return;
    }
    let cancelled = false;
    void skillDocuments.read(target.scope, parsedId).then((draft) => {
      if (cancelled) return;
      setId(draft.id);
      setIdTouched(true);
      setName(draft.name ?? draft.id);
      setDescription(draft.description ?? "");
      setTriggers((draft.triggers ?? []).join(", "));
      setAllowedTools((draft.allowedTools ?? []).join(", "));
      setInstructions(draft.instructions ?? "");
      setFiles([...(draft.files ?? [])]);
      setFilesReady(true);
      setImportedFlags({
        disableModelInvocation: Boolean(draft.disableModelInvocation),
        userInvocable: draft.userInvocable !== false,
      });
    }).catch(() => {
      if (cancelled || !target.skill) return;
      const next = fieldsFromSkill(target.skill);
      setId(parsedId);
      setIdTouched(true);
      setName(next.name);
      setDescription(next.description);
      setTriggers(next.triggers);
      setAllowedTools(next.allowedTools);
      setInstructions(next.instructions);
      setFiles([]);
      setFilesReady(false);
    });
    return () => { cancelled = true; };
  }, [editing, parsedId, target.scope, target.skill]);

  const draft = useMemo(() => ({
    id,
    name,
    description,
    triggers: splitSkillList(triggers),
    allowedTools: splitSkillList(allowedTools),
    instructions,
    files,
    disableModelInvocation: importedFlags.disableModelInvocation,
    userInvocable: importedFlags.userInvocable,
  }), [id, name, description, triggers, allowedTools, instructions, files, importedFlags]);

  const preview = useMemo(() => {
    try {
      if (!id.trim()) return "";
      return serializeSkill(draft);
    } catch {
      return "";
    }
  }, [draft, id]);

  const warning = id.trim() && shadowsBuiltin(id)
    ? `This id shadows the built-in skill "${id.trim().toLowerCase()}".`
    : "";

  const ingestPacks = async (packs: SkillPackSkill[]) => {
    if (packs.length === 0) {
      setError("No SKILL.md found in that folder.");
      return;
    }
    if (editing) {
      if (packs.length > 1) {
        setError("While editing, import a single skill folder.");
        return;
      }
      if (packs[0]) {
        applyPack({ ...packs[0], id: parsedId || packs[0].id });
        setId(parsedId || packs[0].id);
      }
      return;
    }
    if (packs.length === 1 && packs[0]) {
      applyPack(packs[0]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await capabilityService.importSkillPack(target.scope, packs);
      const skipped = result.skipped.length
        ? ` Skipped existing: ${result.skipped.join(", ")}.`
        : "";
      if (result.imported.length === 0) {
        setError(`No skills imported.${skipped}`);
        return;
      }
      onSaved(skillCapabilityId(target.scope, result.imported[0] ?? packs[0]!.id));
      if (result.skipped.length) setNotice(`Imported ${result.imported.length} skills.${skipped}`);
    } catch (err) {
      setError(err instanceof SkillDocumentError || err instanceof Error ? err.message : "Unable to import skills.");
    } finally {
      setBusy(false);
    }
  };

  const ingestEntries = async (entries: { path: string; content: string }[], rootName?: string) => {
    await ingestPacks(discoverSkillPacks(entries, { rootName }));
  };

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    setError("");
    try {
      await ingestEntries(await entriesFromDataTransfer(event.dataTransfer));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read the dropped folder.");
    }
  };

  const onPickFolder = async () => {
    setError("");
    if (isTauri()) {
      try {
        const path = await pickSkillPackDirectory();
        if (!path) return;
        const native = await readSkillPackDirectory(path);
        const rootName = path.replace(/\\/g, "/").split("/").filter(Boolean).pop();
        await ingestEntries(native.map((file) => ({ path: file.relativePath, content: file.content })), rootName);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to import the folder.");
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = editing && target.skill
        ? await capabilityService.updateSkill(target.skill.id, { ...draft, files: filesReady ? files : undefined })
        : await capabilityService.createSkill(target.scope, draft);
      onSaved(saved?.id ?? skillCapabilityId(target.scope, draft.id));
    } catch (err) {
      setError(err instanceof SkillDocumentError || err instanceof Error ? err.message : "Unable to save the skill.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card skill-editor-card">
        <h3>{editing ? "Edit skill" : "Add skill"}</h3>
        <p>
          {target.scope === "project"
            ? "Project skill — stored in .kursor/skills for this workspace only."
            : "User skill — stored in your Kursor data directory and available in every project."}
        </p>
        <div
          className={`skill-drop ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void onDrop(event)}
        >
          <p>Drop a skill folder (SKILL.md plus any extra .md files) or import one.</p>
          <button type="button" className="modal-btn" disabled={busy} onClick={() => void onPickFolder()}>
            Import folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => {
              const list = event.target.files;
              event.target.value = "";
              if (!list?.length) return;
              void entriesFromFileList(list).then(ingestEntries).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Unable to import the folder.");
              });
            }}
          />
        </div>
        <label className="setting-label" htmlFor="skill-id">Id</label>
        <input
          id="skill-id"
          className="modal-input"
          value={id}
          disabled={editing}
          placeholder="search-first"
          onChange={(event) => {
            setIdTouched(true);
            setId(event.target.value);
          }}
        />
        <label className="setting-label" htmlFor="skill-name">Name</label>
        <input
          id="skill-name"
          className="modal-input"
          value={name}
          placeholder="Search first"
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!editing && !idTouched) setId(slugFromName(next));
          }}
        />
        <label className="setting-label" htmlFor="skill-description">Description</label>
        <input
          id="skill-description"
          className="modal-input"
          value={description}
          placeholder="When this skill should be loaded"
          onChange={(event) => setDescription(event.target.value)}
        />
        <label className="setting-label" htmlFor="skill-triggers">Triggers</label>
        <input
          id="skill-triggers"
          className="modal-input"
          value={triggers}
          placeholder="search, library, reuse"
          onChange={(event) => setTriggers(event.target.value)}
        />
        <label className="setting-label" htmlFor="skill-tools">Allowed tools</label>
        <input
          id="skill-tools"
          className="modal-input"
          value={allowedTools}
          placeholder="read_file, search_files, apply_patch"
          onChange={(event) => setAllowedTools(event.target.value)}
        />
        <label className="setting-label" htmlFor="skill-instructions">Instructions</label>
        <textarea
          id="skill-instructions"
          className="modal-input skill-editor-body"
          value={instructions}
          placeholder="How the agent should accomplish the task."
          onChange={(event) => setInstructions(event.target.value)}
        />
        {files.length > 0 && (
          <section>
            <h3>Supporting files</h3>
            <ul className="skill-file-list">
              {files.map((file) => (
                <li key={file.path}>
                  <span>{file.path}</span>
                  <button
                    type="button"
                    className="cap-link"
                    onClick={() => setFiles((current) => current.filter((item) => item.path !== file.path))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {preview && (
          <section>
            <h3>Markdown preview</h3>
            <pre className="skill-editor-preview">{preview}</pre>
          </section>
        )}
        {notice && <p className="skill-import-note">{notice}</p>}
        {warning && <p className="cap-error">{warning}</p>}
        {error && <p className="cap-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="modal-btn primary" disabled={busy || !id.trim()} onClick={() => void save()}>
            {editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
