import { type ContextSource, type SourceCollectResult } from "../types";
import { RuleLoader } from "../../rules/RuleLoader";

export class RuleSource implements ContextSource {
  readonly id = "rule" as const;

  constructor(private readonly loader: RuleLoader) {}

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    try {
      const rules = await this.loader.load(Boolean(snapshot.project));
      const slices = this.loader.toSlices(rules);
      if (slices.length === 0) {
        return { slices: [], skipReason: snapshot.project ? "no project rules" : "no project" };
      }
      return { slices };
    } catch {
      return { slices: [], skipReason: "rule discovery failed" };
    }
  }
}
