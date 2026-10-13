import { useEffect, useState } from "react";
import { MarkdownRenderer } from "../agent/markdown/MarkdownRenderer";
import { parseDelimited } from "../../lib/projectView/table";
import type { ProjectArtifact } from "../../lib/projectView/types";
import { openArtifactExternal, revealArtifact } from "../../lib/projectView/openArtifact";
import { PreviewMessage, usePreviewBytes, usePreviewText } from "./previewState";

const ROW_LIMIT = 400;
const COLUMN_LIMIT = 30;

export function FilePreview({ artifact }: { artifact: ProjectArtifact }) {
  if (artifact.previewCapability !== "native") {
    return <UnsupportedPreview artifact={artifact} />;
  }
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownFile path={artifact.path} />;
    case "html":
      return <HtmlFile path={artifact.path} />;
    case "text":
      return <TextFile path={artifact.path} />;
    case "image":
      return <ImageFile artifact={artifact} />;
    case "pdf":
      return <PdfFile path={artifact.path} />;
    case "spreadsheet":
      return <SpreadsheetFile artifact={artifact} />;
    case "document":
      return <DocumentFile path={artifact.path} />;
    case "presentation":
      return <PresentationFile artifact={artifact} />;
    default:
      return <UnsupportedPreview artifact={artifact} />;
  }
}

export function UnsupportedPreview({ artifact }: { artifact: ProjectArtifact }) {
  return (
    <PreviewMessage
      title="Preview unavailable"
      body={`${artifact.name} cannot be rendered inside Kursor. Open it in another application, or reveal it in the file manager.`}
      actions={<ExternalActions path={artifact.path} />}
    />
  );
}

function ExternalActions({ path }: { path: string }) {
  if (!path) return null;
  return (
    <>
      <button type="button" className="project-view-action" onClick={() => void openArtifactExternal(path)}>Open</button>
      <button type="button" className="project-view-action secondary" onClick={() => void revealArtifact(path)}>Reveal</button>
    </>
  );
}

function MarkdownFile({ path }: { path: string }) {
  const { text, error } = usePreviewText(path);
  if (error) return <PreviewMessage title="Unable to read this file" body={error} />;
  if (text == null) return <PreviewMessage title="Loading document" body={path} />;
  return <div className="project-markdown"><MarkdownRenderer content={text} knownPath={path} /></div>;
}

function HtmlFile({ path }: { path: string }) {
  const { text, error } = usePreviewText(path);
  if (error) return <PreviewMessage title="Unable to read this file" body={error} />;
  if (text == null) return <PreviewMessage title="Loading page" body={path} />;
  return <iframe className="project-view-frame" title={path} sandbox="allow-scripts" srcDoc={text} />;
}

function TextFile({ path }: { path: string }) {
  const { text, error } = usePreviewText(path);
  if (error) return <PreviewMessage title="Unable to read this file" body={error} />;
  if (text == null) return <PreviewMessage title="Loading file" body={path} />;
  return <pre className="project-text">{text}</pre>;
}

function ImageFile({ artifact }: { artifact: ProjectArtifact }) {
  const { bytes, error } = usePreviewBytes(artifact.path);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    const copy = new Uint8Array(bytes);
    const next = URL.createObjectURL(new Blob([copy], { type: artifact.mimeType }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artifact.mimeType, bytes]);
  if (error) return <PreviewMessage title="Unable to read this image" body={error} />;
  if (!url) return <PreviewMessage title="Loading image" body={artifact.name} />;
  return <div className="project-image-wrap"><img className="project-image" src={url} alt={artifact.name} /></div>;
}

function PdfFile({ path }: { path: string }) {
  const { bytes, error } = usePreviewBytes(path);
  const [pages, setPages] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    setPages([]);
    setFailure(null);
    void renderPdf(bytes).then(
      (urls) => { if (!cancelled) setPages(urls); },
      (reason: unknown) => { if (!cancelled) setFailure(reason instanceof Error ? reason.message : "PDF preview failed."); },
    );
    return () => { cancelled = true; };
  }, [bytes]);
  useEffect(() => () => { for (const url of pages) URL.revokeObjectURL(url); }, [pages]);
  if (error || failure) return <PreviewMessage title="Unable to preview this PDF" body={error ?? failure ?? ""} actions={<ExternalActions path={path} />} />;
  if (pages.length === 0) return <PreviewMessage title="Loading PDF" body={path} />;
  return (
    <div className="project-pdf">
      {pages.map((url) => <img key={url} src={url} alt="" />)}
    </div>
  );
}

async function renderPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  }
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const urls: string[] = [];
  const count = Math.min(document.numPages, 20);
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = window.document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) urls.push(URL.createObjectURL(blob));
  }
  return urls;
}

function SpreadsheetFile({ artifact }: { artifact: ProjectArtifact }) {
  const extension = artifact.path.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "csv" || extension === "tsv") return <DelimitedFile path={artifact.path} delimiter={extension === "tsv" ? "\t" : ","} />;
  return <WorkbookFile path={artifact.path} />;
}

function DelimitedFile({ path, delimiter }: { path: string; delimiter: string }) {
  const { text, error } = usePreviewText(path);
  if (error) return <PreviewMessage title="Unable to read this spreadsheet" body={error} />;
  if (text == null) return <PreviewMessage title="Loading spreadsheet" body={path} />;
  return <DataGrid rows={parseDelimited(text, delimiter)} />;
}

function WorkbookFile({ path }: { path: string }) {
  const { bytes, error } = usePreviewBytes(path);
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>([]);
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    setFailure(null);
    void readWorkbook(bytes).then(
      (next) => {
        if (cancelled) return;
        setSheets(next);
        setActive(0);
      },
      (reason: unknown) => { if (!cancelled) setFailure(reason instanceof Error ? reason.message : "Spreadsheet preview failed."); },
    );
    return () => { cancelled = true; };
  }, [bytes]);
  if (error || failure) {
    return <PreviewMessage title="Unable to preview this spreadsheet" body={error ?? failure ?? ""} actions={<ExternalActions path={path} />} />;
  }
  if (sheets.length === 0) return <PreviewMessage title="Loading spreadsheet" body={path} />;
  return (
    <div className="project-sheet-wrap">
      {sheets.length > 1 && (
        <div className="project-sheet-tabs" role="tablist">
          {sheets.map((sheet, index) => (
            <button type="button" key={sheet.name} role="tab" aria-selected={index === active} className={index === active ? "active" : ""} onClick={() => setActive(index)}>
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <DataGrid rows={sheets[active]?.rows ?? []} />
    </div>
  );
}

function DataGrid({ rows }: { rows: string[][] }) {
  const limited = rows.slice(0, ROW_LIMIT).map((row) => row.slice(0, COLUMN_LIMIT));
  const truncated = rows.length > ROW_LIMIT || rows.some((row) => row.length > COLUMN_LIMIT);
  if (limited.length === 0) return <PreviewMessage title="Empty spreadsheet" body="This file has no cell values." />;
  const [header, ...body] = limited;
  return (
    <div className="project-grid-scroll">
      <table className="project-sheet">
        <thead>
          <tr>{header.map((cell, index) => <th key={index}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {truncated && <p className="project-view-note">Showing the first {ROW_LIMIT} rows and {COLUMN_LIMIT} columns.</p>}
    </div>
  );
}

async function readWorkbook(bytes: Uint8Array) {
  const excel = await import("exceljs");
  const workbook = new excel.Workbook();
  await workbook.xlsx.load(copyBytes(bytes));
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(cellText));
    });
    return { name: sheet.name, rows };
  });
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const record = value as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text).join("");
    if (typeof record.text === "string") return record.text;
    if ("result" in record) return cellText(record.result);
    if (typeof record.hyperlink === "string") return record.hyperlink;
  }
  return "";
}

function DocumentFile({ path }: { path: string }) {
  const { bytes, error } = usePreviewBytes(path);
  const [html, setHtml] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    setHtml(null);
    setFailure(null);
    void import("mammoth").then((mammoth) => mammoth.convertToHtml({ arrayBuffer: copyBytes(bytes) })).then(
      (result) => { if (!cancelled) setHtml(result.value.replace(/<script[\s\S]*?<\/script>/gi, "")); },
      (reason: unknown) => { if (!cancelled) setFailure(reason instanceof Error ? reason.message : "Document preview failed."); },
    );
    return () => { cancelled = true; };
  }, [bytes]);
  if (error || failure) return <PreviewMessage title="Unable to preview this document" body={error ?? failure ?? ""} actions={<ExternalActions path={path} />} />;
  if (html == null) return <PreviewMessage title="Loading document" body={path} />;
  return <article className="project-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}

function PresentationFile({ artifact }: { artifact: ProjectArtifact }) {
  const { bytes, error } = usePreviewBytes(artifact.path);
  const [failed, setFailed] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!bytes || !host) return;
    let cancelled = false;
    setFailed(false);
    host.replaceChildren();
    void import("pptx-preview").then(async (module) => {
      const init = module.init;
      if (cancelled || typeof init !== "function") {
        setFailed(true);
        return;
      }
      const width = Math.max(host.clientWidth - 24, 640);
      const previewer = init(host, { width, height: Math.round(width * 9 / 16) });
      await previewer.preview(copyBytes(bytes));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [bytes, host]);
  if (error || failed) {
    return <PreviewMessage title="Preview unavailable" body="This presentation cannot be rendered here. Open it in another application." actions={<ExternalActions path={artifact.path} />} />;
  }
  return (
    <div className="project-pptx">
      {!bytes && <PreviewMessage title="Loading presentation" body={artifact.name} />}
      <div ref={setHost} />
    </div>
  );
}
