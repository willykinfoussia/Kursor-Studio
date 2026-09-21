import { EVAL_SCENARIOS, scenariosById, scenariosBySuite } from "./scenarios";
import { runEvals } from "./runner";
import { formatReport, formatSummary } from "./report";
import type { EvalScenario } from "./types";

function parseArgs(argv: string[]) {
  let scenario: string | undefined;
  let suite: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--scenario" && next) {
      scenario = next;
      index += 1;
    } else if (arg === "--suite" && next) {
      suite = next;
      index += 1;
    } else if (arg?.startsWith("--scenario=")) {
      scenario = arg.slice("--scenario=".length);
    } else if (arg?.startsWith("--suite=")) {
      suite = arg.slice("--suite=".length);
    }
  }
  return { scenario, suite };
}

function selectScenarios(scenario?: string, suite?: string): EvalScenario[] {
  if (scenario) {
    const selected = scenariosById(scenario);
    if (selected.length === 0) {
      throw new Error(`Unknown scenario "${scenario}".`);
    }
    return selected;
  }
  if (suite) {
    const selected = scenariosBySuite(suite);
    if (selected.length === 0) {
      throw new Error(`Unknown suite "${suite}".`);
    }
    return selected;
  }
  return EVAL_SCENARIOS;
}

async function main() {
  const { scenario, suite } = parseArgs(process.argv.slice(2));
  const selected = selectScenarios(scenario, suite);
  const reports = await runEvals(selected);
  for (const report of reports) {
    console.log(formatReport(report));
    console.log("");
  }
  console.log(formatSummary(reports));
  if (reports.some((report) => !report.success)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
