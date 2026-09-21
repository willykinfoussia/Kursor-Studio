import { describe, expect, it } from "vitest";
import { parseSkill } from "../parseSkill";
import {
  assertModelMayLoad,
  assertUserMayInvoke,
  formatLoadedSkillMessage,
  parseSlashSkill,
  renderSkill,
  SkillInvokeError,
} from "../invokeSkill";

describe("invokeSkill", () => {
  it("parses slash ids and leaves non-skill slashes unmatched", () => {
    expect(parseSlashSkill("/prefer-const src/App.tsx")).toEqual({ id: "prefer-const", args: "src/App.tsx" });
    expect(parseSlashSkill("/src/App.tsx")).toBeNull();
    expect(parseSlashSkill("//comment")).toBeNull();
    expect(parseSlashSkill("prefer-const")).toBeNull();
  });

  it("substitutes $ARGUMENTS and $0", () => {
    const loaded = parseSkill(`---
name: demo
---
Args=$ARGUMENTS first=$0
`, "demo");
    expect(renderSkill(loaded, "alpha beta")).toBe("Args=alpha beta first=alpha");
  });

  it("formats the loaded user message", () => {
    const loaded = parseSkill(`---
name: prefer-const
---
Prefer const.
`, "prefer-const");
    expect(formatLoadedSkillMessage(loaded, "src/a.ts")).toContain("Skill prefer-const loaded.");
    expect(formatLoadedSkillMessage(loaded, "src/a.ts")).toContain("src/a.ts");
  });

  it("refuses model load when disableModelInvocation is set without a slash", () => {
    const loaded = parseSkill(`---
name: demo
disable-model-invocation: true
---
body
`, "demo");
    expect(() => assertModelMayLoad(loaded, [])).toThrow(SkillInvokeError);
    expect(() => assertModelMayLoad(loaded, ["demo"])).not.toThrow();
  });

  it("refuses slash when userInvocable is false", () => {
    const loaded = parseSkill(`---
name: demo
user-invocable: false
---
body
`, "demo");
    expect(() => assertUserMayInvoke(loaded)).toThrow(SkillInvokeError);
  });
});
