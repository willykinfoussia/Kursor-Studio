import type { FileSystemService } from "../../../filesystem/FileSystemService";
import { vi } from "vitest";

export function createMockFs(overrides: Partial<FileSystemService> = {}): FileSystemService {
  return {
    listDirectory: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    createFile: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    watch: vi.fn(async () => () => undefined),
    searchFiles: vi.fn(() => []),
    searchProjectFiles: vi.fn(async () => []),
    isBinaryPath: vi.fn(() => false),
    ...overrides,
  };
}
