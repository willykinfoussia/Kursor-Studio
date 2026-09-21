/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../MarkdownRenderer";

afterEach(() => cleanup());

describe("MarkdownRenderer", () => {
  it("renders headings, lists, tables, code, links and GFM", () => {
    render(
      <MarkdownRenderer
        content={`# Title

**bold** and *italic* and ~~strike~~ and \`code\`

- item

1. numbered

> quote

| A | B |
| - | - |
| 1 | 2 |

- [x] done

[Docs](https://example.com)

\`\`\`ts
const n = 1;
\`\`\`
`}
      />,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
    expect(screen.getByText("bold")).toBeTruthy();
    expect(screen.getByText("item")).toBeTruthy();
    expect(screen.getByText("numbered")).toBeTruthy();
    expect(screen.getByText("quote")).toBeTruthy();
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.getByText("ts")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("renders fenced code without a language and GFM tables glued to a paragraph", () => {
    render(
      <MarkdownRenderer
        content={`## Stack
Frontend is Next.js.
| Layer | Tech |
| --- | --- |
| Frontend | Next.js |

\`\`\`
Frontend
├── Pages
\`\`\`
`}
      />,
    );
    expect(screen.getByRole("heading", { name: "Stack" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Next.js")).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
    expect(screen.getByText("Pages", { exact: false })).toBeTruthy();
  });

  it("renders mermaid fences as a diagram block instead of a highlighted CodeBlock", () => {
    render(
      <MarkdownRenderer
        content={`\`\`\`mermaid
flowchart TD
  a --> b
\`\`\`
`}
      />,
    );
    expect(document.querySelector(".mermaid-block")).toBeTruthy();
    expect(document.querySelector(".code-block")).toBeNull();
    expect(screen.queryByText("mermaid")).toBeNull();
  });

  it("renders numbered plan section headings as h2", () => {
    render(
      <MarkdownRenderer
        content={`## 1. Scaffold

Create the Expo app.
`}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "1. Scaffold" })).toBeTruthy();
  });
});
