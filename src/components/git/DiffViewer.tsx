import { DiffEditor, Editor } from "@monaco-editor/react";
import { useMemo, useRef } from "react";
import type * as monaco from "monaco-editor";
import { configureMonaco } from "../../lib/monaco/setup";
import { languageFromPath } from "../../lib/filesystem/languageFromPath";
import { fileName } from "../../lib/git/format";
import { useGitStore } from "../../stores/gitStore";

export function DiffViewer({
  original,
  modified,
  path,
  binary,
  tooLarge,
  hunks,
  onForceLoad,
  onStageHunk,
  onRevertHunk,
  hunkActions,
}: {
  original: string | null;
  modified: string | null;
  path: string | null;
  binary?: boolean;
  tooLarge?: boolean;
  hunks?: { header: string; lines: string[] }[];
  onForceLoad?: () => void;
  onStageHunk?: (index: number) => void;
  onRevertHunk?: (index: number) => void;
  hunkActions?: boolean;
}) {
  const layout = useGitStore((state) => state.diffLayout);
  const wordDiff = useGitStore((state) => state.wordDiff);
  const setDiffLayout = useGitStore((state) => state.setDiffLayout);
  const setWordDiff = useGitStore((state) => state.setWordDiff);
  const stageHunk = useGitStore((state) => state.stageHunk);
  const hunkList = useGitStore((state) => state.hunks);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const language = path ? languageFromPath(path) : "plaintext";
  const visibleHunks = hunks ?? hunkList;
  const showHunkBar = hunkActions !== false && visibleHunks.length > 0;
  const options = useMemo(() => ({
    readOnly: true,
    renderSideBySide: layout === "split",
    ignoreTrimWhitespace: !wordDiff,
    minimap: { enabled: true },
    fontSize: 12,
    lineNumbers: "on" as const,
    scrollBeyondLastLine: false,
    renderIndicators: true,
    wordWrap: "on" as const,
    originalEditable: false,
    automaticLayout: true,
    diffAlgorithm: wordDiff ? "advanced" as const : "legacy" as const,
  }), [layout, wordDiff]);

  const copyHunk = async (index: number) => {
    const hunk = visibleHunks[index];
    if (!hunk) return;
    await navigator.clipboard.writeText([hunk.header, ...hunk.lines].join("\n"));
  };

  const stageSelection = async () => {
    const editor = editorRef.current?.getModifiedEditor();
    const selection = editor?.getSelection();
    if (!selection) return;
    const line = selection.startLineNumber;
    const index = hunkList.findIndex((hunk) => {
      const start = hunk.newStart;
      const end = hunk.newStart + Math.max(hunk.newLines, 1);
      return line >= start && line <= end;
    });
    if (index >= 0) await stageHunk(hunkList[index]);
  };

  if (!path) {
    return <div className="git-diff-empty">Select a file to review the diff.</div>;
  }
  if (binary) {
    return <div className="git-diff-empty">{fileName(path)} is binary.</div>;
  }
  if (tooLarge) {
    return (
      <div className="git-diff-empty">
        File is larger than 1 MB.
        {onForceLoad && <button type="button" className="primary-btn" onClick={onForceLoad}>Load anyway</button>}
      </div>
    );
  }

  return (
    <div className="git-diff">
      <div className="git-diff-header">
        <strong>{fileName(path)}</strong>
        <span>{path}</span>
        <div className="git-diff-controls">
          <button type="button" className={layout === "split" ? "active" : ""} onClick={() => setDiffLayout("split")}>Split</button>
          <button type="button" className={layout === "unified" ? "active" : ""} onClick={() => setDiffLayout("unified")}>Unified</button>
          <button type="button" className={wordDiff ? "active" : ""} onClick={() => setWordDiff(!wordDiff)}>Word diff</button>
          {hunkActions !== false && <button type="button" className="text-link" onClick={() => void stageSelection()}>Stage selection</button>}
        </div>
      </div>
      {showHunkBar && (
        <div className="git-hunk-bar">
          {visibleHunks.map((hunk, index) => (
            <div className="git-hunk-chip" key={`${hunk.header}-${index}`}>
              <span>Hunk {index + 1}</span>
              <button type="button" className="text-link" onClick={() => (onStageHunk ? onStageHunk(index) : void stageHunk(hunkList[index] ?? hunk))}>Stage</button>
              <button type="button" className="text-link" onClick={() => (onRevertHunk ? onRevertHunk(index) : void stageHunk(hunkList[index] ?? hunk, true))}>Revert</button>
              <button type="button" className="text-link" onClick={() => void copyHunk(index)}>Copy</button>
            </div>
          ))}
        </div>
      )}
      <div className="git-diff-editor monaco-host">
        {original === null && modified === null ? (
          <div className="git-diff-empty">No textual diff available.</div>
        ) : original === modified || original == null || modified == null ? (
          <Editor
            height="100%"
            path={`diff://${path}`}
            value={modified ?? original ?? ""}
            language={language}
            theme="kursor-dark"
            beforeMount={configureMonaco}
            options={{ readOnly: true, minimap: { enabled: true }, fontSize: 12, wordWrap: "on" }}
          />
        ) : (
          <DiffEditor
            height="100%"
            original={original}
            modified={modified}
            language={language}
            theme="kursor-dark"
            beforeMount={configureMonaco}
            onMount={(editor) => { editorRef.current = editor; }}
            options={options}
          />
        )}
      </div>
    </div>
  );
}
