import { FileText } from "lucide-react";
import { MarkdownRenderer } from "../agent/markdown/MarkdownRenderer";
import { fileName } from "../../lib/filesystem/pathUtils";
import { useEditorStore } from "../../stores/editorStore";
import { MarkdownDocumentView } from "./MarkdownDocumentView";

export function MarkdownPreviewView({ path }: { path: string }) {
  const tab = useEditorStore((state) => state.tabs.find((item) => item.path === path));
  const startRaw = useEditorStore((state) => state.pendingReveal?.path === path);
  const content = tab?.content ?? "";

  return (
    <MarkdownDocumentView
      key={path}
      path={path}
      content={content}
      pathLabel={<><FileText size={12} /> Markdown › {fileName(path)}</>}
      viewLabel="Markdown view"
      defaultRaw={startRaw}
    >
      {content.trim() && <MarkdownRenderer content={content} knownPath={path} />}
    </MarkdownDocumentView>
  );
}
