import { describe, expect, it } from "vitest";
import { languageFromPath } from "../languageFromPath";

describe("languageFromPath", () => {
  it("maps common extensions", () => {
    expect(languageFromPath("src/App.tsx")).toBe("typescript");
    expect(languageFromPath("src/main.ts")).toBe("typescript");
    expect(languageFromPath("src/index.js")).toBe("javascript");
    expect(languageFromPath("src/view.jsx")).toBe("javascript");
    expect(languageFromPath("package.json")).toBe("json");
    expect(languageFromPath("styles.css")).toBe("css");
    expect(languageFromPath("index.html")).toBe("html");
    expect(languageFromPath("main.py")).toBe("python");
    expect(languageFromPath("lib.rs")).toBe("rust");
    expect(languageFromPath("Main.java")).toBe("java");
    expect(languageFromPath("main.cpp")).toBe("cpp");
    expect(languageFromPath("main.c")).toBe("c");
    expect(languageFromPath("README.md")).toBe("markdown");
    expect(languageFromPath("docker-compose.yaml")).toBe("yaml");
    expect(languageFromPath("config.yml")).toBe("yaml");
  });
});
