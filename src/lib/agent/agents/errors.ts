export class NestedAgentError extends Error {
  constructor(message = "Nested specialist spawn is not allowed.") {
    super(message);
    this.name = "NestedAgentError";
  }
}

export class AgentBusyError extends Error {
  constructor(message = "A specialist is already running for this task.") {
    super(message);
    this.name = "AgentBusyError";
  }
}

export class UnknownAgentError extends Error {
  constructor(id: string) {
    super(`Unknown specialist "${id}".`);
    this.name = "UnknownAgentError";
  }
}
