import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "../../tauri/invoke";
import { gitApi } from "../../tauri/githubApi";
import { processApi } from "../../tauri/processApi";
import { projectApi } from "../../tauri/projectApi";
import { assertSafeHttpsUrl } from "../web/safety";
import type { AgentGitService, AgentHttpService, AgentProcessService } from "./native";
import type { WebFetchImpl } from "../web/types";

export { assertSafeHttpsUrl } from "../web/safety";

export const nativeProcessService: AgentProcessService = {
  run: ({ command, cwd, timeoutMs }) => processApi.run(command, cwd, timeoutMs),
  start: ({ command, cwd }) => processApi.start(command, cwd),
  output: (jobId) => processApi.output(jobId),
  kill: (jobId) => processApi.kill(jobId),
};

export const nativeGitService: AgentGitService = {
  status: () => projectApi.gitStatus(),
  diff: (path) => projectApi.gitDiff(path),
  async commit({ message, paths, push }) {
    if (paths && paths.length > 0) await gitApi.addPaths(paths);
    else await gitApi.add();
    await gitApi.commit(message);
    if (push) await gitApi.push();
    return { committed: true as const, pushed: Boolean(push) };
  },
  push: () => gitApi.push(),
  pull: () => gitApi.pull(),
  fetch: () => gitApi.fetch(),
  checkout: (branch) => gitApi.checkout(branch),
  createBranch: (branch, start) => gitApi.createBranch(branch, start),
};

export const nativeFetchImpl: WebFetchImpl = (input, init) => {
  if (isTauri()) return tauriFetch(input, init) as Promise<Response>;
  return globalThis.fetch(input, init);
};

export function createHttpService(fetchImpl: WebFetchImpl = nativeFetchImpl): AgentHttpService {
  return {
    async fetchText(url, options) {
      const parsed = assertSafeHttpsUrl(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("http-timeout"), options.timeoutMs);
      const signal = AbortSignal.any([options.signal, controller.signal]);
      try {
        const response = await fetchImpl(parsed.toString(), {
          method: "GET",
          redirect: "follow",
          signal,
          headers: { "User-Agent": "Kursor/0.1" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        let body = await response.text();
        if (body.length > options.maxChars) {
          body = body.slice(0, options.maxChars);
        }
        return {
          url: parsed.toString(),
          status: response.status,
          contentType,
          body,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const nativeHttpService = createHttpService();
