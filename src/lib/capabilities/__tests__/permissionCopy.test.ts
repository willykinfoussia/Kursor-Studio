import { describe, expect, it } from "vitest";
import { describePermission, permissionRows, redactCapabilityText } from "../permissionCopy";

describe("permission copy", () => {
  it("explains filesystem.read without exposing slugs only", () => {
    const copy = describePermission("filesystem.read");
    expect(copy.group).toBe("Filesystem");
    expect(copy.action).toBe("Read");
    expect(copy.explanation).toContain("active project");
    const rows = permissionRows("filesystem.read", { approval: "auto" });
    expect(rows.find((row) => row.group === "Filesystem")?.allowed).toBe(true);
    expect(rows.find((row) => row.group === "Network")?.allowed).toBe(false);
    expect(rows.find((row) => row.group === "Approval")?.action).toBe("Automatic");
  });

  it("redacts secrets and secret refs", () => {
    expect(redactCapabilityText("token: ghp_abcdefghijklmnop")).toContain("[redacted]");
    expect(redactCapabilityText("env secret://github/token")).toContain("secret://[ref]");
    expect(redactCapabilityText("API_KEY=abc")).toContain("[redacted]");
  });
});
