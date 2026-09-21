type AgentLogData = Record<string, string | number | boolean | null | undefined>;

function sanitize(data?: AgentLogData): AgentLogData | undefined {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !/key|token|secret|content|prompt/i.test(key)),
  );
}

export const agentLogger = {
  info(message: string, data?: AgentLogData) {
    console.info(`[Agent] ${message}`, sanitize(data) ?? "");
  },
  warn(message: string, data?: AgentLogData) {
    console.warn(`[Agent] ${message}`, sanitize(data) ?? "");
  },
  error(message: string, data?: AgentLogData) {
    console.error(`[Agent] ${message}`, sanitize(data) ?? "");
  },
};
