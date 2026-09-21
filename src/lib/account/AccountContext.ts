import type { Account } from "./types";

export function accountPromptContext(account: Account | null) {
  if (!account) return "";
  const name = account.displayName || account.username || "local user";
  return `The current Kursor user is ${name}. Do not mention account secrets.`;
}
