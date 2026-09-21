import { describe, expect, it } from "vitest";
import { parseGitReview } from "../review/parseReview";

describe("parseGitReview", () => {
  it("reads the trailing JSON report", () => {
    const result = parseGitReview(`Looks risky.

{"summary":"Null check missing","risk":"high","findings":[{"title":"Crash","detail":"foo is null","file":"src/App.tsx"}],"issues":["crash"],"files":["src/App.tsx"]}
`);
    expect(result.risk).toBe("high");
    expect(result.summary).toBe("Null check missing");
    expect(result.findings[0]?.file).toBe("src/App.tsx");
    expect(result.files).toEqual(["src/App.tsx"]);
  });
});
