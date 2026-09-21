import { describe, expect, it } from "vitest";
import type { ContextFileStore } from "../../context/types";
import {
  inspectProfile,
  overlayUnknownKeys,
  writeVerifyProfile,
} from "../profile";
import { VERIFY_JSON_PATH } from "../types";

class MemoryFiles implements ContextFileStore {
  constructor(
    readonly files: Record<string, string> = {},
    private readonly dirs: Record<string, { name: string; path: string; kind: "file" | "directory" }[]> = {},
  ) {}

  async readFile(path: string) {
    if (!(path in this.files)) throw new Error(`missing ${path}`);
    return this.files[path] ?? "";
  }

  async listDirectory(path: string) {
    return this.dirs[path] ?? this.dirs["."] ?? [];
  }

  async writeFile(path: string, content: string) {
    this.files[path] = content;
  }

  async createDirectory() {}
}

describe("inspectProfile / writeVerifyProfile", () => {
  it("separates auto-detect, overlay, and resolved layers", async () => {
    const files = nodeFiles({
      [VERIFY_JSON_PATH]: JSON.stringify({ lint: false, test: "vitest run", custom: [{ name: "e2e", command: "pnpm e2e" }] }),
    });
    const inspection = await inspectProfile(files);
    expect(inspection.ecosystem).toBe("node");
    expect(inspection.detectedFrom).toEqual(["package.json", "tsconfig.json"]);
    expect(inspection.auto.test).toBe("pnpm test");
    expect(inspection.overlay.test).toBe("vitest run");
    expect(inspection.overlay.lint).toBe(false);
    expect(inspection.resolved.test).toBe("vitest run");
    expect(inspection.resolved.lint).toBe(false);
    expect(inspection.checks.find((check) => check.kind === "test")?.origin).toBe("custom");
    expect(inspection.checks.find((check) => check.kind === "lint")?.origin).toBe("disabled");
    expect(inspection.checks.find((check) => check.kind === "typecheck")?.origin).toBe("auto");
    expect(inspection.hasCustom).toBe(true);
  });

  it("round-trips overlay only and does not persist auto commands as custom", async () => {
    const files = nodeFiles();
    const written = await writeVerifyProfile(files, {
      lint: false,
      custom: [{ name: "e2e", command: "pnpm e2e" }],
      expectedFiles: ["src/index.ts"],
    });
    const stored = JSON.parse(files.files[VERIFY_JSON_PATH] ?? "{}") as Record<string, unknown>;
    expect(stored).toEqual({
      lint: false,
      custom: [{ name: "e2e", command: "pnpm e2e" }],
      expectedFiles: ["src/index.ts"],
    });
    expect(stored.test).toBeUndefined();
    expect(stored.typecheck).toBeUndefined();
    expect(written.test).toBeUndefined();
    files.files[VERIFY_JSON_PATH] = JSON.stringify(stored);
    const inspection = await inspectProfile(files);
    expect(inspection.overlay).toEqual(stored);
    expect(inspection.auto.test).toBe("pnpm test");
    expect(inspection.resolved.test).toBe("pnpm test");
    expect(inspection.resolved.lint).toBe(false);
  });

  it("rejects unknown overlay keys", () => {
    expect(overlayUnknownKeys({ timeout: 12, cwd: "src" })).toEqual(["timeout", "cwd"]);
    expect(overlayUnknownKeys({ test: false })).toEqual([]);
  });
});

function nodeFiles(extra: Record<string, string> = {}) {
  return new MemoryFiles({
    "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", build: "vite build" } }),
    "tsconfig.json": "{}",
    ...extra,
  }, {
    ".": [
      { name: "package.json", path: "package.json", kind: "file" },
      { name: "tsconfig.json", path: "tsconfig.json", kind: "file" },
    ],
  });
}
