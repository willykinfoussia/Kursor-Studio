/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const appVersion = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version as string;

const WATCH_IGNORE = [
  "**/src-tauri/**",
  "**/fixtures/**",
  "**/.git/**",
  "**/.cursor/**",
  "**/doc/**",
  "**/dist/**",
  "**/*.log",
];

function isIgnoredWorkspaceFile(file: string) {
  const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
  return (
    relative.startsWith("src-tauri/") ||
    relative.startsWith("fixtures/") ||
    relative.startsWith(".git/") ||
    relative.startsWith(".cursor/") ||
    relative.startsWith("doc/") ||
    relative.startsWith("dist/") ||
    relative.endsWith(".log")
  );
}

function ignoreWorkspaceWrites(): Plugin {
  return {
    name: "kursor-ignore-workspace-writes",
    apply: "serve",
    enforce: "pre",
    hotUpdate({ file }) {
      if (isIgnoredWorkspaceFile(file)) return [];
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), ignoreWorkspaceWrites()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  clearScreen: false,
  optimizeDeps: {
    include: [
      "monaco-editor",
      "@monaco-editor/react",
      "monaco-editor/editor/editor.worker.js",
      "monaco-editor/language/json/json.worker.js",
      "monaco-editor/language/css/css.worker.js",
      "monaco-editor/language/html/html.worker.js",
      "monaco-editor/language/typescript/ts.worker.js",
    ],
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/code editors/**", "**/fixtures/**"],
    environment: "node",
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: WATCH_IGNORE,
    },
  },
}));
