import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { FileCode2 } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { filePathFromFence } from "../../../lib/agent/conversation";
import { useEditorStore } from "../../../stores/editorStore";
import { useProjectStore } from "../../../stores/projectStore";
import { resolveProjectPath } from "../../../lib/filesystem/pathUtils";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

function highlight(code: string, language?: string) {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

interface CodeBlockProps {
  language?: string;
  meta?: string;
  code: string;
  knownPath?: string | null;
}

export function CodeBlock({ language, meta, code, knownPath }: CodeBlockProps) {
  const fencePath = knownPath ?? filePathFromFence(language ?? "", meta);
  const projectRoot = useProjectStore((state) => state.currentProject?.rootPath ?? null);

  const openInEditor = () => {
    if (!fencePath) return;
    let path = fencePath;
    if (projectRoot && !/^[a-zA-Z]:[\\/]/.test(fencePath) && !fencePath.startsWith("/")) {
      try {
        path = resolveProjectPath(projectRoot, fencePath);
      } catch {
        path = fencePath;
      }
    }
    void useEditorStore.getState().openFile(path);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "code"}</span>
        <div className="code-block-actions">
          {fencePath && (
            <button
              type="button"
              className="copy-btn"
              onClick={openInEditor}
              aria-label={`Open ${fencePath} in editor`}
            >
              <FileCode2 size={11} />
              Open {fencePath}
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="code-block-pre">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlight(code, language) }} />
      </pre>
    </div>
  );
}
