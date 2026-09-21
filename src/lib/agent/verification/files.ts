import { fileSystemService } from "../../filesystem/FileSystemService";
import type { ContextFileStore } from "../context/types";
import { projectContextFiles } from "../context/fileStores";
import type { VerifyProfileWriter } from "./types";

export function projectVerifyFiles(): ContextFileStore & VerifyProfileWriter {
  const read = projectContextFiles();
  return {
    readFile: (path) => read.readFile(path),
    listDirectory: (path) => read.listDirectory(path),
    writeFile: (path, content) => fileSystemService.writeFile(path, content),
    createDirectory: (path) => fileSystemService.createDirectory(path),
  };
}
