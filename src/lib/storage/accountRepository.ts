import { accountApi } from "../tauri/accountApi";
import type { AccountRecord } from "../storage/types";

export const accountRepository = {
  current: () => accountApi.current(),
  upsert: (account: AccountRecord) => accountApi.upsert(account),
  markOnboarded: () => accountApi.markOnboarded(),
  githubAccount: (accountId: string) => accountApi.githubAccount(accountId),
};
