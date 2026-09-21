import { memo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { MarkdownLink } from "./MarkdownLink";
import { MarkdownTable } from "./MarkdownTable";
import { MermaidBlock } from "./MermaidBlock";
import { normalizeStreamingMarkdown, ensureGfmTables } from "./streamingMarkdown";

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
  knownPath?: string | null;
}

function MarkdownCode({
  className,
  children,
  knownPath,
}: {
  className?: string;
  children?: ReactNode;
  knownPath?: string | null;
}) {
  const raw = Array.isArray(children) ? children.join("") : String(children ?? "");
  const language = (/language-(\S+)/.exec(className ?? "")?.[1] ?? "").toLowerCase();
  const code = raw.replace(/\n$/, "");
  const isBlock = Boolean(className?.includes("language-")) || raw.includes("\n");
  if (!isBlock) {
    return <code className="md-inline-code">{children}</code>;
  }
  const meta = className?.replace(/language-\S+\s*/, "").trim() || undefined;
  if (language === "mermaid") {
    return <MermaidBlock code={code} />;
  }
  return <CodeBlock language={language} meta={meta} code={code} knownPath={knownPath} />;
}

function MarkdownRendererInner({ content, streaming = false, knownPath }: MarkdownRendererProps) {
  const source = streaming ? normalizeStreamingMarkdown(content) : ensureGfmTables(content);
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: MarkdownLink,
          table: MarkdownTable,
          pre: ({ children }) => <>{children}</>,
          code: (props) => <MarkdownCode className={props.className} knownPath={knownPath}>{props.children}</MarkdownCode>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
