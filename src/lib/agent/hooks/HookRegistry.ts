import type { HookEventName, HookHandler } from "./types";

export class HookRegistry {
  private readonly handlers: HookHandler[] = [];

  use(handler: HookHandler) {
    this.handlers.push(handler);
    return this;
  }

  replace(handlers: readonly HookHandler[]) {
    this.handlers.splice(0, this.handlers.length, ...handlers);
  }

  list(event?: HookEventName): HookHandler[] {
    if (!event) return [...this.handlers];
    return this.handlers.filter((handler) => handler.event === event);
  }

  clear() {
    this.handlers.splice(0, this.handlers.length);
  }
}
