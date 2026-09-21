import { fileSystemService } from "../filesystem/FileSystemService";
import { ChangeTrackingService } from "./ChangeTrackingService";
import { createAiChangeStore } from "./persist";
import type { ReviewFiles } from "./types";

export function createReviewFiles(): ReviewFiles {
  return {
    async read(path) {
      try {
        return await fileSystemService.readFile(path);
      } catch {
        return null;
      }
    },
    async write(path, content) {
      await fileSystemService.writeFile(path, content);
    },
    async delete(path) {
      await fileSystemService.delete(path);
    },
    async rename(from, to) {
      await fileSystemService.rename(from, to);
    },
    isBinary(path) {
      return fileSystemService.isBinaryPath(path);
    },
  };
}

export function createDefaultChangeTracking() {
  return new ChangeTrackingService({
    files: createReviewFiles(),
    persist: createAiChangeStore(),
  });
}
