import { DiffEditor } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { configureMonaco } from "../../lib/monaco/setup";
import { languageFromPath } from "../../lib/filesystem/languageFromPath";
import { changeSetStats, type AiChangeHunk, type AiFileChange, type HunkFilter } from "../../lib/review";
import { VirtualList } from "../git/VirtualList";
import { ReviewStatusIcon, reviewStatusLabel } from "./ReviewStatusIcon";
import { activeReviewChangeSet, selectedReviewFile, useReviewStore } from "../../stores/reviewStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useUiStore } from "../../stores/uiStore";
import { useGitStore } from "../../stores/gitStore";

const FILTERS: HunkFilter[] = ["all", "pending", "accepted", "rejected", "conflicts"];

export function ReviewWorkspace() {
  const changeSet = useReviewStore(activeReviewChangeSet);
  const file = useReviewStore(selectedReviewFile);
  const filter = useReviewStore((state) => state.hunkFilter);
  const selectedHunkId = useReviewStore((state) => state.selectedHunkId);
  const conflict = useReviewStore((state) => state.conflict);
  const error = useReviewStore((state) => state.error);
  const layout = useSettingsStore((state) => state.reviewDiffLayout);
  const setLayout = useSettingsStore((state) => state.update);
  const setFocused = useReviewStore((state) => state.setFocused);
  const selectFile = useReviewStore((state) => state.selectFile);
  const selectHunk = useReviewStore((state) => state.selectHunk);
  const setFilter = useReviewStore((state) => state.setFilter);
  const acceptAll = useReviewStore((state) => state.acceptAll);
  const rejectAll = useReviewStore((state) => state.rejectAll);
  const acceptFile = useReviewStore((state) => state.acceptFile);
  const rejectFile = useReviewStore((state) => state.rejectFile);
  const acceptHunk = useReviewStore((state) => state.acceptHunk);
  const rejectHunk = useReviewStore((state) => state.rejectHunk);
  const undoHunk = useReviewStore((state) => state.undoHunk);
  const closeReview = useReviewStore((state) => state.closeReview);
  const resolveConflict = useReviewStore((state) => state.resolveConflict);
  const clearConflict = useReviewStore((state) => state.clearConflict);
  const stageAccepted = useReviewStore((state) => state.stageAccepted);
  const [menu, setMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);

  useEffect(() => {
    setFocused(true);
    return () => setFocused(false);
  }, [setFocused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (useUiStore.getState().activeView !== "review") return;
      const state = useReviewStore.getState();
      if (!state.focused || state.conflict) return;
      const current = selectedReviewFile(state);
      const set = activeReviewChangeSet(state);
      if (!current || !set) return;
      const hunks = visibleHunks(current, state.hunkFilter);
      const hunkIndex = hunks.findIndex((hunk) => hunk.id === state.selectedHunkId);
      const fileIndex = set.files.findIndex((item) => item.id === current.id);
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        const hunk = hunks[hunkIndex] ?? hunks.find((item) => item.status === "pending");
        if (hunk) void acceptHunk(current.id, hunk.id);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        const hunk = hunks[hunkIndex] ?? hunks.find((item) => item.status === "pending");
        if (hunk?.status === "pending") void rejectHunk(current.id, hunk.id);
        else if (hunk) void undoHunk(current.id, hunk.id);
        return;
      }
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        const next = hunks[hunkIndex + 1] ?? hunks[0];
        if (next) selectHunk(next.id);
      }
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        const prev = hunks[hunkIndex - 1] ?? hunks[hunks.length - 1];
        if (prev) selectHunk(prev.id);
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        const next = set.files[fileIndex + 1] ?? set.files[0];
        if (next) selectFile(next.id);
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        const prev = set.files[fileIndex - 1] ?? set.files[set.files.length - 1];
        if (prev) selectFile(prev.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [acceptHunk, rejectHunk, undoHunk, selectHunk, selectFile]);

  const stats = useMemo(() => changeSet ? changeSetStats(changeSet) : null, [changeSet]);
  const hunks = file ? visibleHunks(file, filter) : [];

  if (!changeSet || !stats) {
    return <div className="review-empty">No AI changes are waiting for review.</div>;
  }

  return (
    <section className="review-workspace" tabIndex={0} onFocus={() => setFocused(true)} onClick={() => setMenu(null)}>
      <header className="review-header">
        <div>
          <h2>AI Changes Review</h2>
          <p>
            {stats.files} files · <span className="add">+{stats.additions}</span> · <span className="del">-{stats.deletions}</span>
            {" · "}
            {stats.pending} pending · {stats.accepted} accepted · {stats.rejected} rejected · {stats.partial} partial · {stats.conflicted} conflicts
          </p>
        </div>
        <div className="review-header-actions">
          <button type="button" className="primary-btn" onClick={() => void acceptAll()} title="Accept all pending changes">Accept All</button>
          <button type="button" className="danger-btn" onClick={() => void rejectAll()} title="Reject all pending AI changes">Reject All</button>
          <button type="button" onClick={() => closeReview()}>Close Review</button>
        </div>
      </header>
      {error && <div className="review-error" role="alert">{error}</div>}
      <div className="review-body">
        <aside className="review-files" aria-label="Changed files">
          <VirtualList
            items={changeSet.files}
            itemHeight={28}
            renderItem={(item) => (
              <button
                type="button"
                className={`review-file-row${item.id === file?.id ? " active" : ""}`}
                onClick={() => selectFile(item.id)}
                onDoubleClick={() => void useEditorStore.getState().openFile(item.path)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  selectFile(item.id);
                  setMenu({ x: event.clientX, y: event.clientY, fileId: item.id });
                }}
              >
                <ReviewStatusIcon status={item.status} kind={item.kind} />
                <span className="name" title={item.path}>{fileName(item.path)}</span>
                <span className="add">+{item.additions}</span>
                <span className="del">-{item.deletions}</span>
              </button>
            )}
          />
        </aside>
        <div className="review-diff">
          {file && (
            <div className="review-file-header">
              <div>
                <strong>{file.path}{file.previousPath ? ` ← ${file.previousPath}` : ""}</strong>
                <span className="review-file-meta">{reviewStatusLabel(file.status)} · <span className="add">+{file.additions}</span> · <span className="del">-{file.deletions}</span></span>
              </div>
              <div className="review-file-actions">
                <button type="button" title="Reject File" onClick={() => void rejectFile(file.id)}>Reject File</button>
                <button type="button" className="primary-btn" title="Accept File" onClick={() => void acceptFile(file.id)}>Accept File</button>
                <button type="button" onClick={() => void useEditorStore.getState().openFile(file.path)}>Open File</button>
                <button type="button" onClick={() => { useFileExplorerStore.getState().selectFile(file.path); useUiStore.getState().setView("project"); }}>View in Explorer</button>
                {file.toolCallIds[0] && <span className="review-tool">Tool {file.toolCallIds[0].slice(0, 8)}</span>}
              </div>
            </div>
          )}
          <div className="review-filter-row">
            {FILTERS.map((item) => (
              <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{labelFilter(item)}</button>
            ))}
            <button type="button" className={layout === "unified" ? "active" : ""} onClick={() => setLayout("reviewDiffLayout", "unified")}>Inline</button>
            <button type="button" className={layout === "split" ? "active" : ""} onClick={() => setLayout("reviewDiffLayout", "split")}>Side-by-side</button>
          </div>
          {file?.binary || file?.tooLarge ? (
            <div className="review-empty">
              <strong>Binary file changed</strong>
              <div className="review-file-actions">
                <button type="button" onClick={() => file && void useEditorStore.getState().openFile(file.path)}>Open File</button>
                <button type="button" onClick={() => file && void rejectFile(file.id)}>Reject File</button>
                <button type="button" className="primary-btn" onClick={() => file && void acceptFile(file.id)}>Accept File</button>
              </div>
            </div>
          ) : (
            <div className="review-diff-editor monaco-host">
              <DiffEditor
                height="100%"
                original={file?.baseContent ?? ""}
                modified={file?.proposedContent ?? file?.baseContent ?? ""}
                language={languageFromPath(file?.path ?? "file.ts")}
                theme="kursor-dark"
                beforeMount={configureMonaco}
                options={{
                  readOnly: true,
                  originalEditable: false,
                  renderSideBySide: layout === "split",
                  minimap: { enabled: true },
                  fontSize: 12,
                  automaticLayout: true,
                  renderIndicators: true,
                }}
              />
            </div>
          )}
          {file && hunks.length > 0 && (
            <div className="review-hunks" aria-label="Diff hunks">
              {hunks.map((hunk) => (
                <HunkCard
                  key={hunk.id}
                  hunk={hunk}
                  active={hunk.id === selectedHunkId}
                  onSelect={() => selectHunk(hunk.id)}
                  onAccept={() => void acceptHunk(file.id, hunk.id)}
                  onReject={() => void rejectHunk(file.id, hunk.id)}
                  onUndo={() => void undoHunk(file.id, hunk.id)}
                />
              ))}
            </div>
          )}
          {changeSet.status !== "active" && (
            <div className="review-git-actions">
              <button type="button" onClick={() => { useGitStore.getState().setMode("changes"); useUiStore.getState().setView("github"); }}>View Git Changes</button>
              <button type="button" onClick={() => void stageAccepted()}>Stage Accepted Changes</button>
              <button type="button" onClick={() => { useGitStore.getState().setMode("changes"); useUiStore.getState().setView("github"); }}>Create Commit</button>
            </div>
          )}
        </div>
      </div>
      {menu && (
        <div className="review-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" onClick={() => { void acceptFile(menu.fileId); setMenu(null); }}>Accept File</button>
          <button type="button" onClick={() => { void rejectFile(menu.fileId); setMenu(null); }}>Reject File</button>
          <button type="button" onClick={() => {
            const target = changeSet.files.find((item) => item.id === menu.fileId);
            if (target) void useEditorStore.getState().openFile(target.path);
            setMenu(null);
          }}>Open File</button>
        </div>
      )}
      {conflict && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Review conflict</h3>
            <p>{conflict.reason}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => void resolveConflict("keep-current")}>Keep Current</button>
              <button type="button" onClick={() => void resolveConflict("use-ai")}>Use AI Version</button>
              <button type="button" onClick={() => void resolveConflict("use-original")}>Use Original Version</button>
              <button type="button" className="primary-btn" onClick={() => { void resolveConflict("open-merge"); if (file) void useEditorStore.getState().openFile(file.path); }}>Open Merge Editor</button>
              <button type="button" onClick={() => clearConflict()}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HunkCard({
  hunk,
  active,
  onSelect,
  onAccept,
  onReject,
  onUndo,
}: {
  hunk: AiChangeHunk;
  active: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  return (
    <article className={`review-hunk${active ? " active" : ""}`} onClick={onSelect}>
      <header>
        <ReviewStatusIcon status={hunk.status} />
        <span>@@ {hunk.oldStart},{hunk.oldLines} {hunk.newStart},{hunk.newLines} @@</span>
      </header>
      <pre>{hunk.patch.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")).slice(0, 12).join("\n")}</pre>
      {hunk.status === "pending" || hunk.status === "conflicted" ? (
        <div className="review-hunk-actions">
          <button type="button" title="Reject hunk (Ctrl+N)" onClick={onReject}>Reject</button>
          <button type="button" className="primary-btn" title="Accept hunk (Ctrl+Shift+Y)" onClick={onAccept}>Accept</button>
        </div>
      ) : (
        <div className="review-hunk-actions">
          <span>{hunk.status === "accepted" ? "✓ Accepted" : "× Rejected"}</span>
          <button type="button" title="Undo (Ctrl+N)" onClick={onUndo}>Undo</button>
        </div>
      )}
    </article>
  );
}

function visibleHunks(file: AiFileChange, filter: HunkFilter) {
  if (filter === "all") return file.hunks;
  if (filter === "pending") return file.hunks.filter((hunk) => hunk.status === "pending");
  if (filter === "accepted") return file.hunks.filter((hunk) => hunk.status === "accepted");
  if (filter === "rejected") return file.hunks.filter((hunk) => hunk.status === "rejected");
  return file.hunks.filter((hunk) => hunk.status === "conflicted");
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function labelFilter(filter: HunkFilter) {
  if (filter === "conflicts") return "Conflicts";
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}
