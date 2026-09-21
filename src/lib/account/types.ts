export interface Account {
  id: string;
  provider: "github" | "local";
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  onboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AccountContext {
  account: Account;
  githubConnected: boolean;
  githubUsername?: string;
}

export function toAccount(record: {
  id: string;
  provider: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  onboarded: number;
  createdAt: number;
  updatedAt: number;
}): Account {
  return {
    id: record.id,
    provider: record.provider === "github" ? "github" : "local",
    username: record.username ?? undefined,
    displayName: record.displayName ?? undefined,
    avatarUrl: record.avatarUrl ?? undefined,
    onboarded: record.onboarded === 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
