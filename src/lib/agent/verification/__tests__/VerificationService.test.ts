import { describe, expect, it } from "vitest";
import type { ContextFileStore } from "../../context/types";
import { VerificationService } from "../VerificationService";
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

describe("VerificationService.saveOverlay", () => {
  it("writes only the overlay and leaves auto-detected commands out of verify.json", async () => {
    const files = new MemoryFiles({
      "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "eslint ." } }),
      "tsconfig.json": "{}",
    }, {
      ".": [
        { name: "package.json", path: "package.json", kind: "file" },
        { name: "tsconfig.json", path: "tsconfig.json", kind: "file" },
      ],
    });
    const service = new VerificationService({ files, writer: files });
    const inspection = await service.saveOverlay({ lint: false });
    const stored = JSON.parse(files.files[VERIFY_JSON_PATH] ?? "{}") as Record<string, unknown>;
    expect(stored).toEqual({ lint: false });
    expect(stored.test).toBeUndefined();
    expect(inspection.auto.test).toBe("pnpm test");
    expect(inspection.resolved.test).toBe("pnpm test");
    expect(inspection.overlay.lint).toBe(false);
    expect(inspection.checks.find((check) => check.kind === "test")?.origin).toBe("auto");
  });
});
