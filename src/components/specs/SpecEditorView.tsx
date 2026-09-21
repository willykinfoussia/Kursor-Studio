import { useMemo } from "react";
import { FileText } from "lucide-react";
import { MarkdownRenderer } from "../agent/markdown/MarkdownRenderer";
import { MarkdownDocumentView } from "../editor/MarkdownDocumentView";
import { fileName } from "../../lib/filesystem/pathUtils";
import { titleFromFileName } from "../../lib/graph/createSpec";
import { parseSpecFrontmatter } from "../../lib/graph/extract/frontmatter";
import {
  specKindFromPath,
  specKindLabel,
  specScope,
  type SpecScope,
} from "../../lib/graph/classify";
import { useEditorStore } from "../../stores/editorStore";

function stripLeadingTitleHeading(body: string, title: string): string {
  const match = body.match(/^(\s*)#\s+(.+?)\s*(?:\r?\n|$)/);
  if (!match) return body;
  if (match[2].trim().toLowerCase() !== title.trim().toLowerCase()) return body;
  return body.slice(match[0].length);
}

function specPreviewModel(content: string, path: string) {
  const { data, body } = parseSpecFrontmatter(content);
  const name = fileName(path);
  const title = data.title?.trim() || titleFromFileName(name);
  const pathScope = specScope(path);
  const scope: SpecScope = data.scope === "account" || data.scope === "project" ? data.scope : pathScope;
  const type = data.type?.trim() || specKindFromPath(path);
  const typeLabel = specKindLabel(type, scope === "none" ? undefined : scope);
  const scopeLabel = scope === "account" ? "Account" : scope === "project" ? "Project" : "";
  return {
    title,
    meta: [scopeLabel, typeLabel].filter(Boolean).join(" · "),
    body: stripLeadingTitleHeading(body, title),
    headerKind: scope === "account" ? "Account specs" : "Project specs",
    name,
  };
}

export function SpecEditorView({ path }: { path: string }) {
  const tab = useEditorStore((state) => state.tabs.find((item) => item.path === path));
  const startRaw = useEditorStore((state) => state.pendingReveal?.path === path);
  const content = tab?.content ?? "";
  const preview = useMemo(() => specPreviewModel(content, path), [content, path]);

  return (
    <MarkdownDocumentView
      key={path}
      path={path}
      content={content}
      pathLabel={<><FileText size={12} /> {preview.headerKind} › {preview.name}</>}
      viewLabel="Spec view"
      defaultRaw={startRaw}
    >
      <h1 className="md-doc-title">{preview.title}</h1>
      {preview.meta && <p className="md-doc-meta">{preview.meta}</p>}
      {preview.body.trim() && <MarkdownRenderer content={preview.body} knownPath={path} />}
    </MarkdownDocumentView>
  );
}
