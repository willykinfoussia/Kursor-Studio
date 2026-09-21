#!/usr/bin/env node
/**
 * GitHub-like MCP mock without tokens. search_issues only.
 */
import { stdin, stdout } from "node:process";

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) handle(line);
  }
});

function send(message) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, payload) {
  send({ jsonrpc: "2.0", id, result: payload });
}

const ISSUES = [
  { number: 12, title: "Fix login redirect", state: "open" },
  { number: 18, title: "Add MCP health panel", state: "open" },
];

function handle(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;
  if (method === "initialize") {
    result(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "kursor-github-mock", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") {
    result(id, {});
    return;
  }
  if (method === "tools/list") {
    result(id, {
      tools: [
        {
          name: "search_issues",
          description: "Search mock GitHub issues.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
          annotations: { readOnlyHint: true, openWorldHint: true },
        },
      ],
    });
    return;
  }
  if (method === "tools/call") {
    const query = String(params?.arguments?.query ?? "").toLowerCase();
    const hits = ISSUES.filter((issue) => issue.title.toLowerCase().includes(query) || query === "");
    result(id, { content: [{ type: "text", text: JSON.stringify(hits) }] });
    return;
  }
  if (method === "resources/list") {
    result(id, { resources: [] });
    return;
  }
  if (method === "prompts/list") {
    result(id, { prompts: [] });
    return;
  }
  if (typeof id !== "undefined") {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}
