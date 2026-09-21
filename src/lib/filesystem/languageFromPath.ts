import { extensionOf } from "./pathUtils";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  py: "python",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  go: "go",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  xml: "xml",
  svg: "xml",
};

export function languageFromPath(path: string): string {
  const extension = extensionOf(path);
  if (!extension) return "plaintext";
  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}
