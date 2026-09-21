import { isTauri } from "../tauri/invoke";
import { accountRepository } from "../storage/accountRepository";
import { toAccount, type Account, type AccountContext } from "./types";

const LOCAL: Account = {
  id: "local-account",
  provider: "local",
  username: "local",
  displayName: "Local Account",
  onboarded: false,
  createdAt: 0,
  updatedAt: 0,
};

export const accountService = {
  async current(): Promise<Account> {
    if (!isTauri()) return LOCAL;
    return toAccount(await accountRepository.current());
  },
  async markOnboarded(): Promise<Account> {
    if (!isTauri()) return { ...LOCAL, onboarded: true };
    return toAccount(await accountRepository.markOnboarded());
  },
  async context(githubConnected: boolean, githubUsername?: string): Promise<AccountContext> {
    const account = await accountService.current();
    return { account, githubConnected, githubUsername };
  },
};
