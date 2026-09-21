#!/usr/bin/env node
/**
 * Minimal stdio MCP mock: echo, add, search, resource mock://project-info, prompt test-prompt.
 * No secrets. Speaks newline-delimited JSON-RPC for rmcp / the official SDK.
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
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: "kursor-mock", version: "1.0.0" },
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
          name: "echo",
          description: "Echo text back.",
          inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
          annotations: { readOnlyHint: true },
        },
        {
          name: "add",
          description: "Add two numbers.",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
          annotations: { readOnlyHint: true },
        },
        {
          name: "search",
          description: "Search mock project files.",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
          annotations: { readOnlyHint: true },
        },
      ],
    });
    return;
  }
  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name === "echo") {
      result(id, { content: [{ type: "text", text: String(args.text ?? "") }] });
      return;
    }
    if (name === "add") {
      result(id, { content: [{ type: "text", text: String(Number(args.a) + Number(args.b)) }] });
      return;
    }
    if (name === "search") {
      result(id, { content: [{ type: "text", text: `hits for ${args.query}: src/App.tsx` }] });
      return;
    }
    result(id, { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] });
    return;
  }
  if (method === "resources/list") {
    result(id, {
      resources: [{ uri: "mock://project-info", name: "Project info", mimeType: "text/plain" }],
    });
    return;
  }
  if (method === "resources/read") {
    result(id, {
      contents: [{ uri: params?.uri, mimeType: "text/plain", text: "Kursor mock project" }],
    });
    return;
  }
  if (method === "prompts/list") {
    result(id, {
      prompts: [{ name: "test-prompt", description: "A test prompt", arguments: [{ name: "topic", required: false }] }],
    });
    return;
  }
  if (method === "prompts/get") {
    result(id, {
      messages: [{ role: "user", content: { type: "text", text: `Talk about ${params?.arguments?.topic ?? "MCP"}` } }],
    });
    return;
  }
  if (typeof id !== "undefined") {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}
