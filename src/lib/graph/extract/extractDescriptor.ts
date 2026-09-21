import { extensionOf, fileName, normalizeRelativePath } from "../../filesystem/pathUtils";
import { classifyFile, resolveSpecKind, specScope } from "../classify";
import { parseSpecFrontmatter } from "./frontmatter";
import { sha256Hex } from "../hash";
import { fileBasename } from "../ids";
import { graphTokens, uniqueSorted } from "../tokenize";
import type { FileDescriptor, GraphFileStore, WalkedFile } from "../types";
import { extractImports } from "./imports";
import { extractSpreadsheet } from "./spreadsheet";

const CODE_EXTENSIONS = new Set(["py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "go", "java", "kt", "c", "h", "cpp", "hpp", "cs", "rb", "php"]);
const TEXT_EXTENSIONS = new Set(["md", "markdown", "txt", "rst", "json", "yaml", "yml", "toml", "csv", "tsv", "sql", "xml", "html", "htm", "css", "scss", "sh", "bash"]);

export async function extractDescriptor(
  walked: WalkedFile,
  files: GraphFileStore,
): Promise<FileDescriptor> {
  const path = normalizeRelativePath(walked.relativePath);
  const name = fileName(path);
  const extension = extensionOf(path) ?? "";
  const basename = fileBasename(path);
  const base: Omit<FileDescriptor, "hash"> = {
    path,
    name,
    basename,
    extension,
    size: walked.size,
    modifiedAt: walked.modifiedAt,
    tokens: graphTokens(`${basename} ${path.replace(/[\\/._-]+/g, " ")}`),
    metadata: {
      category: classifyFile(path),
      scope: specScope(path),
      specType: resolveSpecKind(path),
    },
  };

  if (extension === "xlsx" || extension === "xls") {
    return extractBinarySpreadsheet(base, files, path);
  }

  let content = "";
  try {
    content = await files.readFile(path);
  } catch {
    const hash = await sha256Hex(`${path}:${walked.size}:${walked.modifiedAt}`);
    return { ...base, hash, tokens: uniqueSorted(base.tokens) };
  }

  if (CODE_EXTENSIONS.has(extension)) return extractCode({ ...base, content }, content);
  if (TEXT_EXTENSIONS.has(extension) || content) return extractText({ ...base, content }, content);

  const hash = await sha256Hex(content);
  return { ...base, content, hash, tokens: uniqueSorted(base.tokens) };
}

async function extractBinarySpreadsheet(
  base: Omit<FileDescriptor, "hash">,
  files: GraphFileStore,
  path: string,
): Promise<FileDescriptor> {
  if (!files.readBytes) {
    const hash = await sha256Hex(path);
    return { ...base, hash };
  }
  try {
    const bytes = await files.readBytes(path);
    const extracted = await extractSpreadsheet(bytes);
    const tokens = uniqueSorted([
      ...base.tokens,
      ...graphTokens(extracted.tokens.join(" ")),
    ]);
    const hash = await sha256Hex(bytes);
    return {
      ...base,
      tokens,
      hash,
      metadata: {
        ...base.metadata,
        sheets: extracted.sheets,
        headers: extracted.headers,
        namedRanges: extracted.namedRanges,
        formulas: extracted.formulas,
        cellText: extracted.cellText.slice(0, 80),
      },
    };
  } catch {
    const hash = await sha256Hex(path);
    return { ...base, hash };
  }
}

async function extractCode(base: Omit<FileDescriptor, "hash">, content: string): Promise<FileDescriptor> {
  const imports = uniqueSorted(extractImports(content, base.extension));
  const symbols = uniqueSorted(extractSymbols(content, base.extension));
  const mentions = uniqueSorted(extractMentions(content));
  const tokens = uniqueSorted([...base.tokens, ...graphTokens(content), ...graphTokens(symbols.join(" "))]);
  const hash = await sha256Hex(content);
  return {
    ...base,
    content,
    tokens,
    symbols,
    hash,
    metadata: {
      ...base.metadata,
      imports,
      mentions,
    },
  };
}

async function extractText(base: Omit<FileDescriptor, "hash">, content: string): Promise<FileDescriptor> {
  const frontmatter = parseSpecFrontmatter(content);
  const mentions = uniqueSorted(extractMentions(content));
  const headers = uniqueSorted(extractMarkdownHeadings(content));
  const title = frontmatter.data.title ?? headers[0];
  const tokens = uniqueSorted([
    ...base.tokens,
    ...graphTokens(content),
    ...graphTokens(headers.join(" ")),
    ...graphTokens(title ?? ""),
  ]);
  const hash = await sha256Hex(content);
  const metadata: Record<string, unknown> = {
    ...base.metadata,
    mentions,
    scope: frontmatter.data.scope ?? base.metadata.scope,
    specType: resolveSpecKind(base.path, { specType: frontmatter.data.type ?? base.metadata.specType }),
    title: title ?? "",
  };
  const imports = uniqueSorted(extractImports(content, base.extension));
  if (imports.length > 0) metadata.imports = imports;
  if (base.extension === "csv" || base.extension === "tsv") {
    const first = content.split(/\r?\n/, 1)[0] ?? "";
    metadata.headers = uniqueSorted(first.split(/[,\t]/).map((item) => item.trim()));
  }
  if (base.extension === "json") {
    metadata.jsonKeys = uniqueSorted(extractJsonKeys(content));
  }
  return { ...base, content, tokens, hash, metadata };
}

function extractSymbols(content: string, extension: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  if (extension === "py") {
    const re = /(?:^|\n)\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)|(?:^|\n)\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((match = re.exec(content))) found.push(match[1] || match[2] || "");
  } else {
    const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)|(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
    while ((match = re.exec(content))) found.push(match[1] || match[2] || match[3] || "");
  }
  return found.filter(Boolean);
}

function extractMentions(content: string): string[] {
  const found: string[] = [];
  const pathLike = /(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g;
  const mdLink = /\[[^\]]*]\(([^)]+)\)/g;
  const filename = /\b[A-Za-z0-9_.-]+\.(?:py|ts|tsx|js|jsx|md|json|ya?ml|sql|csv|xlsx|rs|go|txt)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pathLike.exec(content))) found.push(match[0].replace(/\\/g, "/"));
  while ((match = mdLink.exec(content))) found.push(match[1] ?? "");
  while ((match = filename.exec(content))) found.push(match[0]);
  return found;
}

function extractMarkdownHeadings(content: string): string[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    return match?.[1] ? [match[1]] : [];
  });
}

function extractJsonKeys(content: string): string[] {
  const keys: string[] = [];
  const re = /"([^"]+)"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) keys.push(match[1] ?? "");
  return keys;
}
