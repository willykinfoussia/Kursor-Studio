import { type ReactNode, useState } from "react";
import Editor from "@monaco-editor/react";
import { configureMonaco } from "../../lib/monaco/setup";
import { languageFromPath } from "../../lib/filesystem/languageFromPath";
import { useEditorStore } from "../../stores/editorStore";

interface MarkdownDocumentViewProps {
  path: string;
  content: string;
  pathLabel: ReactNode;
  viewLabel: string;
  extraActions?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  defaultRaw?: boolean;
}

export function MarkdownDocumentView({
  path,
  content,
  pathLabel,
  viewLabel,
  extraActions,
  banner,
  children,
  defaultRaw = false,
}: MarkdownDocumentViewProps) {
  const updateContent = useEditorStore((state) => state.updateContent);
  const [raw, setRaw] = useState(defaultRaw);

  return (
    <div className="md-doc-editor">
      <div className="md-doc-header">
        <span className="md-doc-path">{pathLabel}</span>
        <div className="md-doc-actions">
          <div className="md-doc-toggle" role="tablist" aria-label={viewLabel}>
            <button
              type="button"
              role="tab"
              aria-selected={!raw}
              className={!raw ? "active" : ""}
              onClick={() => setRaw(false)}
            >
              Preview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={raw}
              className={raw ? "active" : ""}
              onClick={() => setRaw(true)}
            >
              Raw
            </button>
          </div>
          {extraActions}
        </div>
      </div>
      {banner}
      {raw ? (
        <div className="monaco-host md-doc-raw">
          <Editor
            key={path}
            path={`file:///${path}`}
            value={content}
            language={languageFromPath(path)}
            theme="kursor-dark"
            beforeMount={configureMonaco}
            onMount={(editor) => {
              editor.layout();
              const reveal = useEditorStore.getState().pendingReveal;
              if (reveal?.path === path && reveal.line) {
                editor.revealLineInCenter(reveal.line);
                editor.setPosition({ lineNumber: reveal.line, column: 1 });
                useEditorStore.getState().clearReveal();
              }
            }}
            onChange={(value) => updateContent(path, value ?? "")}
            options={{
              automaticLayout: true,
              fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
              fontSize: 12,
              lineHeight: 20,
              minimap: { enabled: false },
              folding: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              insertSpaces: true,
            }}
          />
        </div>
      ) : (
        <div className="md-doc-body">{children}</div>
      )}
    </div>
  );
}
