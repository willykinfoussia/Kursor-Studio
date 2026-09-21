import { aiChangeRepository } from "../storage/aiChangeRepository";
import { cloneChangeSet, type AiChangeSet, type AiReviewDecision, type ChangeStore } from "./types";

export function createAiChangeStore(): ChangeStore {
  return {
    save: (changeSet: AiChangeSet) => aiChangeRepository.save(cloneChangeSet(changeSet)),
    get: (id: string) => aiChangeRepository.get(id),
    listOpen: (projectId: string) => aiChangeRepository.listOpen(projectId),
    saveDecision: (decision: AiReviewDecision) => aiChangeRepository.saveDecision(decision),
  };
}
