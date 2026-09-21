import { invokeCommand } from "./invoke";

export const agentApi = {
  ping: () => invokeCommand<string>("agent_ping", undefined, "mock-agent-ready"),
};
