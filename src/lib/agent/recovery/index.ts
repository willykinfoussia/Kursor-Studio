export { FileJournal } from "./FileJournal";
export { nativeRecoveryGit } from "./git";
export { RecoveryManager } from "./RecoveryManager";
export type { RecoveryManagerOptions } from "./RecoveryManager";
export {
  ABSENT_HASH,
  changeLogPaths,
  contentHash,
  emptyChangeLog,
  FILE_MUTATE_TOOLS,
  isTestCommand,
  shouldCreateCheckpoint,
  uniquePaths,
} from "./types";
export type {
  ChangeLog,
  CommandLogEntry,
  JournalEntry,
  RecoveryCheckpoint,
  RecoveryFiles,
  RecoveryGit,
  RecoveryKind,
  RollbackResult,
  TestLogEntry,
} from "./types";
