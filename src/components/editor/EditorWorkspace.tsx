import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { ChevronRight, Copy, ExternalLink, FileCode2, FileJson, Files, FileText, FolderOpen, ListTodo, Save, X } from "lucide-react";
import { configureMonaco } from "../../lib/monaco/setup";
import { languageFromPath } from "../../lib/filesystem/languageFromPath";
import { isPlanFilePath } from "../../lib/agent/plans/planFile";
import { isMarkdownSpecFile } from "../../lib/graph/classify";
import { projectApi } from "../../lib/tauri/projectApi";
import type { AiChangeSet } from "../../lib/review";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useUiStore } from "../../stores/uiStore";
import { IconButton } from "../ui/Controls";
import { PlanEditorView } from "../plans/PlanEditorView";
import { SpecEditorView } from "../specs/SpecEditorView";

interface TabMenuState { x: number; y: number; path: string }

function pendingReviewFor(changeSets: AiChangeSet[], activePath: string | null) {
  if (!activePath) return null;
  for (const changeSet of changeSets) {
    const file = changeSet.files.find((item) => (
      item.path === activePath && item.status !== "accepted" && item.status !== "rejected"
    ));
    if (file) return { changeSetId: changeSet.id, fileId: file.id };
  }
  return null;
}

function TabIcon({ name }: { name: string }) {
  if (name.endsWith(".json")) return <FileJson size={13} className="json-icon" />;
  if (name.endsWith(".plan.md")) return <ListTodo size={13} className="md-icon" />;
  if (name.endsWith(".md")) return <FileText size={13} className="md-icon" />;
  return <FileCode2 size={13} className="tsx-icon" />;
}

export function EditorWorkspace() {
  const tabs = useEditorStore((state) => state.tabs);
  const activePath = useEditorStore((state) => state.activePath);
  const setActive = useEditorStore((state) => state.setActive);
  const closeTab = useEditorStore((state) => state.closeTab);
  const closeOthers = useEditorStore((state) => state.closeOthers);
  const closeAll = useEditorStore((state) => state.closeAll);
  const updateContent = useEditorStore((state) => state.updateContent);
  const saveActive = useEditorStore((state) => state.saveActive);
  const status = useEditorStore((state) => state.status);
  const opening = useEditorStore((state) => state.opening);
  const saving = useEditorStore((state) => state.saving);
  const selectFile = useFileExplorerStore((state) => state.selectFile);
  const revealInTree = useFileExplorerStore((state) => state.revealInTree);
  const changeSets = useReviewStore((state) => state.changeSets);
  const openReview = useReviewStore((state) => state.openReview);
  const setView = useUiStore((state) => state.setView);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const active = tabs.find((tab) => tab.path === activePath);
  const pendingReviewFile = pendingReviewFor(changeSets, activePath);
  const [menu, setMenu] = useState<TabMenuState | null>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  const openTabMenu = (event: React.MouseEvent, path: string) => {
    event.preventDefault();
    setActive(path);
    selectFile(path);
    setMenu({ x: event.clientX, y: event.clientY, path });
  };

  const revealInExplorer = (path: string) => {
    void revealInTree(path);
    setView("project");
    if (!useUiStore.getState().sidebarVisible) toggleSidebar();
  };

  return (
    <section className="editor-area">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab.path === activePath}
            className={`editor-tab ${tab.path === activePath ? "active" : ""}`}
            key={tab.path}
            title={tab.path}
            onClick={() => { setActive(tab.path); selectFile(tab.path); }}
            onContextMenu={(event) => openTabMenu(event, tab.path)}
          >
            <TabIcon name={tab.name} />
            <span className="tab-name">{tab.name}{tab.isDirty ? " •" : ""}</span>
            <span className="tab-close" role="button" aria-label={`Fermer ${tab.name}`} onClick={(event) => { event.stopPropagation(); void closeTab(tab.path); }}>
              <X size={12} />
            </span>
          </button>
        ))}
        <div className="tabs-actions">
          <IconButton icon={Save} label="Save" size={14} disabled={!active?.isDirty || saving} onClick={() => void saveActive()} />
        </div>
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button className="context-item" onClick={() => { void closeTab(menu.path); setMenu(null); }}>
            <X size={13} /> Close
          </button>
          <button
            className="context-item"
            disabled={tabs.length < 2}
            onClick={() => { void closeOthers(menu.path); setMenu(null); }}
          >
            <Files size={13} /> Close Others
          </button>
          <button className="context-item" onClick={() => { void closeAll(); setMenu(null); }}>
            <X size={13} /> Close All
          </button>
          <div className="context-divider" />
          <button className="context-item" onClick={() => { void navigator.clipboard?.writeText(menu.path); setMenu(null); }}>
            <Copy size={13} /> Copy Path
          </button>
          <button className="context-item" onClick={() => { revealInExplorer(menu.path); setMenu(null); }}>
            <FolderOpen size={13} /> View in Explorer
          </button>
          <button className="context-item" onClick={() => { void projectApi.reveal(menu.path); setMenu(null); }}>
            <ExternalLink size={13} /> Open in File Manager
          </button>
        </div>
      )}
      {active ? (
        <>
          <div className="breadcrumb">
            {active.path.split("/").map((part, index, parts) => (
              <span key={`${part}-${index}`} style={{ display: "contents" }}>
                <span>{part}</span>{index < parts.length - 1 && <ChevronRight size={11} />}
              </span>
            ))}
            {opening && <span className="editor-status">Opening file...</span>}
            {saving && <span className="editor-status">Saving...</span>}
            {status && <span className="editor-status error">{status}</span>}
            {pendingReviewFile && (
              <button
                type="button"
                className="text-link review-pending-banner"
                onClick={() => openReview(pendingReviewFile.changeSetId, pendingReviewFile.fileId)}
              >
                AI changes pending review
              </button>
            )}
          </div>
          {active.binary ? (
            <div className="empty-editor binary-preview">
              <strong>Binary file</strong>
              <span>Preview unavailable</span>
            </div>
          ) : active.encodingError ? (
            <div className="empty-editor binary-preview">
              <strong>Unable to display this file as UTF-8.</strong>
            </div>
          ) : isPlanFilePath(active.path) ? (
            <PlanEditorView path={active.path} />
          ) : isMarkdownSpecFile(active.path) ? (
            <SpecEditorView path={active.path} />
          ) : (
            <div className="monaco-host">
              <Editor
                key={active.path}
                path={`file:///${active.path}`}
                value={active.content}
                language={languageFromPath(active.path)}
                theme="kursor-dark"
                beforeMount={configureMonaco}
                onMount={(editor) => {
                  editor.layout();
                  const reveal = useEditorStore.getState().pendingReveal;
                  if (reveal?.path === active.path && reveal.line) {
                    editor.revealLineInCenter(reveal.line);
                    editor.setPosition({ lineNumber: reveal.line, column: 1 });
                    useEditorStore.getState().clearReveal();
                  }
                }}
                onChange={(value) => updateContent(active.path, value ?? "")}
                options={{
                  automaticLayout: true,
                  fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
                  fontSize: 12,
                  lineHeight: 20,
                  minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
                  folding: true,
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true, indentation: true },
                  smoothScrolling: true,
                  cursorSmoothCaretAnimation: "on",
                  padding: { top: 10 },
                  renderLineHighlight: "line",
                  renderValidationDecorations: "off",
                  scrollBeyondLastLine: false,
                  mouseWheelZoom: true,
                  wordWrap: "off",
                  tabSize: 2,
                  insertSpaces: true,
                }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="empty-editor">{opening ? "Opening file..." : status || "Open a file to start editing"}</div>
      )}
    </section>
  );
}
