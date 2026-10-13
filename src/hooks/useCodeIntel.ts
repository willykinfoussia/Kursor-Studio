import { useSyncExternalStore } from "react";
import { codeIntelSession } from "../lib/codeIntel/session";

export function useCodeIntel() {
  return useSyncExternalStore(codeIntelSession.subscribe, codeIntelSession.getSnapshot, codeIntelSession.getSnapshot);
}
