const JS_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
const C_EXTENSIONS = new Set(["c", "h", "cpp", "hpp", "cc", "hh"]);
const JAVA_EXTENSIONS = new Set(["java", "kt"]);
const CSS_EXTENSIONS = new Set(["css", "scss"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const SHELL_EXTENSIONS = new Set(["sh", "bash"]);

const STD_JAVA = /^(java|javax|jakarta|kotlin|android)\b/;
const STD_CSHARP = /^(System|Microsoft|UnityEngine|Windows)\b/;
const STD_RUST = /^(std|core|alloc|proc_macro)\b/;

export function extractImports(content: string, extension: string): string[] {
  const found: string[] = [];
  const ext = extension.toLowerCase();

  if (ext === "py") found.push(...pythonImports(content));
  if (JS_EXTENSIONS.has(ext)) found.push(...javascriptImports(content));
  if (ext === "rs") found.push(...rustImports(content));
  if (ext === "go") found.push(...goImports(content));
  if (JAVA_EXTENSIONS.has(ext)) found.push(...javaImports(content));
  if (ext === "cs") found.push(...csharpImports(content));
  if (ext === "php") found.push(...phpImports(content));
  if (ext === "rb") found.push(...rubyImports(content));
  if (C_EXTENSIONS.has(ext)) found.push(...cIncludes(content));
  if (ext === "sql") found.push(...sqlIncludes(content));
  if (CSS_EXTENSIONS.has(ext)) found.push(...cssImports(content));
  if (HTML_EXTENSIONS.has(ext)) found.push(...htmlRefs(content));
  if (SHELL_EXTENSIONS.has(ext)) found.push(...shellSources(content));

  return found.filter(Boolean);
}

function pythonImports(content: string): string[] {
  const found: string[] = [];
  const fromImport = /(?:^|\n)\s*from\s+(\.?[A-Za-z0-9_.]+)\s+import/g;
  const plainImport = /(?:^|\n)\s*import\s+(\.?[A-Za-z0-9_.]+(?:\s*,\s*[A-Za-z0-9_.]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = fromImport.exec(content))) found.push(match[1] ?? "");
  while ((match = plainImport.exec(content))) {
    for (const part of (match[1] ?? "").split(",")) found.push(part.trim());
  }
  return found;
}

function javascriptImports(content: string): string[] {
  const found: string[] = [];
  const moduleImport = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  const requireImport = /require\(\s*["']([^"']+)["']\s*\)/g;
  const dynamicImport = /import\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = moduleImport.exec(content))) found.push(match[1] ?? "");
  while ((match = requireImport.exec(content))) found.push(match[1] ?? "");
  while ((match = dynamicImport.exec(content))) found.push(match[1] ?? "");
  return found;
}

function rustImports(content: string): string[] {
  const found: string[] = [];
  const rustMod = /(?:^|\n)\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rustUse = /(?:^|\n)\s*(?:pub\s+)?use\s+((?:crate|super|self|[A-Za-z_][A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = rustMod.exec(content))) found.push(`./${match[1]}`);
  while ((match = rustUse.exec(content))) {
    const spec = rustUseToSpec(match[1] ?? "");
    if (spec) found.push(spec);
  }
  return found;
}

function rustUseToSpec(path: string): string | undefined {
  const parts = path.split("::").filter((part) => part && part !== "crate" && part !== "super" && part !== "self");
  if (parts.length === 0) return undefined;
  if (parts[0] && STD_RUST.test(parts[0])) return undefined;
  return parts.join("/");
}

function goImports(content: string): string[] {
  const found: string[] = [];
  const single = /(?:^|\n)\s*import\s+(?:\w+\s+)?["']([^"']+)["']/g;
  const block = /(?:^|\n)\s*import\s*\(([\s\S]*?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = single.exec(content))) found.push(match[1] ?? "");
  while ((match = block.exec(content))) {
    const quoted = /["']([^"']+)["']/g;
    let inner: RegExpExecArray | null;
    while ((inner = quoted.exec(match[1] ?? ""))) found.push(inner[1] ?? "");
  }
  return found;
}

function javaImports(content: string): string[] {
  const found: string[] = [];
  const re = /(?:^|\n)\s*import\s+(?:static\s+)?([A-Za-z_][\w.]*)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const spec = match[1] ?? "";
    if (!STD_JAVA.test(spec)) found.push(spec);
  }
  return found;
}

function csharpImports(content: string): string[] {
  const found: string[] = [];
  const re = /(?:^|\n)\s*using\s+(?:static\s+)?(?:global\s+)?([A-Za-z_][\w.]*)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const spec = match[1] ?? "";
    if (!STD_CSHARP.test(spec)) found.push(spec);
  }
  return found;
}

function phpImports(content: string): string[] {
  const found: string[] = [];
  const useStmt = /(?:^|\n)\s*use\s+([A-Za-z_\\][\w\\]*)/g;
  const requireStmt = /(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = useStmt.exec(content))) found.push((match[1] ?? "").replace(/\\/g, "/"));
  while ((match = requireStmt.exec(content))) found.push(match[1] ?? "");
  return found;
}

function rubyImports(content: string): string[] {
  const found: string[] = [];
  const re = /require(?:_relative)?\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) found.push(match[1] ?? "");
  return found;
}

function cIncludes(content: string): string[] {
  const found: string[] = [];
  const re = /#\s*include\s+[<"]([^>"]+)[>"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) found.push(match[1] ?? "");
  return found;
}

function sqlIncludes(content: string): string[] {
  const found: string[] = [];
  const re = /(?:^|\n)\s*(?:\\i|SOURCE|\.read)\s+["']?([^\s"';]+)["']?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) found.push(match[1] ?? "");
  return found;
}

function cssImports(content: string): string[] {
  const found: string[] = [];
  const re = /@import\s+(?:url\()?["']?([^"');]+)["']?\)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const spec = (match[1] ?? "").trim();
    if (spec && !/^https?:/i.test(spec)) found.push(spec);
  }
  return found;
}

function htmlRefs(content: string): string[] {
  const found: string[] = [];
  const re = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const spec = match[1] ?? "";
    if (spec && !/^https?:/i.test(spec) && !spec.startsWith("data:") && !spec.startsWith("#") && !spec.startsWith("mailto:")) {
      found.push(spec);
    }
  }
  return found;
}

function shellSources(content: string): string[] {
  const found: string[] = [];
  const re = /(?:^|\n)\s*(?:source|\.)\s+(["']?)([^"'\s]+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) found.push(match[2] ?? "");
  return found;
}
