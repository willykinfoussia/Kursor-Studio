import {
  mergeTestingFailure,
  mergeTestingReport,
  testingCoversHarnessTest,
  testingLevelsFor,
  verificationKindsWithoutTest,
} from "../../testing/bridge";
import type { TestRun, TestStrategyDecision } from "../../testing/domain";
import type { VerificationEngine } from "./VerificationEngine";
import type { CheckResult, CheckRunner, PlannedCheck, VerificationReport, VerificationRunInput } from "./types";

export interface RequiredVerificationTesting {
  run(input: {
    levels: Array<"unit" | "integration" | "e2e">;
    requestId: string;
    signal?: AbortSignal;
    runner: CheckRunner;
  }): Promise<{ run: TestRun; strategy: TestStrategyDecision } | null>;
}

export async function runRequiredVerification(input: {
  engine: VerificationEngine;
  runner?: CheckRunner;
  testing?: RequiredVerificationTesting | null;
  planned: { kinds?: VerificationRunInput["kinds"] };
  attempt: number;
  requestId: string;
  signal?: AbortSignal;
  onCheckStart?: (check: PlannedCheck) => void;
  onCheckEnd?: (result: CheckResult) => void;
}): Promise<VerificationReport> {
  const levels = input.runner && input.testing ? testingLevelsFor(input.planned) : null;
  let tested: { run: TestRun; strategy: TestStrategyDecision } | null = null;
  let testingError: unknown = null;
  if (levels && input.testing && input.runner) {
    try {
      tested = await input.testing.run({
        levels,
        requestId: input.requestId,
        signal: input.signal,
        runner: input.runner,
      });
    } catch (error) {
      testingError = error;
    }
  }
  const covers = Boolean(tested && levels && testingCoversHarnessTest(tested.strategy, levels));
  const narrowed = covers ? verificationKindsWithoutTest(input.planned) : null;
  const harness = await input.engine.run({
    runner: input.runner,
    attempt: input.attempt,
    signal: input.signal,
    kinds: narrowed ? narrowed.kinds : input.planned.kinds,
    customNames: narrowed?.customNames,
    onCheckStart: input.onCheckStart,
    onCheckEnd: input.onCheckEnd,
  });
  if (testingError) return mergeTestingFailure(harness, testingError);
  if (tested && levels) return mergeTestingReport(harness, tested.run, tested.strategy, levels);
  return harness;
}
