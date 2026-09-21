import { create } from "zustand";
import { accountService } from "../lib/account/AccountService";
import { githubAuthService } from "../lib/github/GitHubAuthService";
import { isTauri, toErrorMessage } from "../lib/tauri/invoke";
import type { Account } from "../lib/account/types";

const DEVICE_CODE_RE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/i;

export interface GitHubSignInProgress {
  message?: string;
  userCode?: string | null;
  verificationUri?: string | null;
}

export function parseGitHubSignInProgress(payload: unknown): {
  statusMessage: string;
  deviceUserCode: string | null;
  deviceVerificationUri: string | null;
} {
  if (typeof payload === "string") {
    const match = payload.match(DEVICE_CODE_RE);
    return {
      statusMessage: payload,
      deviceUserCode: match?.[1] ?? null,
      deviceVerificationUri: null,
    };
  }
  if (payload && typeof payload === "object") {
    const record = payload as GitHubSignInProgress;
    const message = typeof record.message === "string" ? record.message : "";
    const explicitCode = typeof record.userCode === "string" ? record.userCode.trim() : "";
    const deviceUserCode = explicitCode || message.match(DEVICE_CODE_RE)?.[1] || null;
    const verificationUri = typeof record.verificationUri === "string" ? record.verificationUri.trim() : "";
    return {
      statusMessage: message || (deviceUserCode ? `Enter ${deviceUserCode} in the browser to finish GitHub sign-in` : ""),
      deviceUserCode,
      deviceVerificationUri: verificationUri || null,
    };
  }
  return { statusMessage: "", deviceUserCode: null, deviceVerificationUri: null };
}

interface AccountState {
  currentAccount: Account | null;
  githubConnected: boolean;
  githubUsername?: string;
  isLoading: boolean;
  statusMessage: string | null;
  deviceUserCode: string | null;
  deviceVerificationUri: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  continueLocal: () => Promise<void>;
  applySignInProgress: (payload: unknown) => void;
  signInGitHub: (options?: { ensureRepository?: boolean }) => Promise<void>;
  signOutGitHub: () => Promise<void>;
  markOnboarded: () => Promise<void>;
}

const clearedDevice = {
  deviceUserCode: null as string | null,
  deviceVerificationUri: null as string | null,
};

export const useAccountStore = create<AccountState>((set) => ({
  currentAccount: null,
  githubConnected: false,
  githubUsername: undefined,
  isLoading: false,
  statusMessage: null,
  ...clearedDevice,
  error: null,
  hydrate: async () => {
    set({ isLoading: true, error: null, statusMessage: null, ...clearedDevice });
    try {
      const [account, githubConnected, user] = await Promise.all([
        accountService.current(),
        githubAuthService.isAuthenticated().catch(() => false),
        githubAuthService.getCurrentUser().catch(() => null),
      ]);
      set({
        currentAccount: account,
        githubConnected: githubConnected || Boolean(user),
        githubUsername: user?.login ?? account.username,
        isLoading: false,
      });
    } catch (error) {
      set({
        currentAccount: await accountService.current().catch(() => null),
        isLoading: false,
        error: error instanceof Error ? error.message : "Unable to load the account.",
      });
    }
  },
  continueLocal: async () => {
    const account = await accountService.markOnboarded();
    set({ currentAccount: account, githubConnected: false, error: null, ...clearedDevice });
  },
  applySignInProgress: (payload) => {
    const parsed = parseGitHubSignInProgress(payload);
    if (!parsed.statusMessage && !parsed.deviceUserCode) return;
    set((state) => ({
      statusMessage: parsed.statusMessage || state.statusMessage || "Opening GitHub…",
      deviceUserCode: parsed.deviceUserCode ?? state.deviceUserCode,
      deviceVerificationUri: parsed.deviceVerificationUri ?? state.deviceVerificationUri,
      isLoading: true,
      error: null,
    }));
  },
  signInGitHub: async (options) => {
    set({ isLoading: true, error: null, statusMessage: "Opening GitHub…", ...clearedDevice });
    let unlisten = () => {};
    try {
      if (isTauri()) {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<GitHubSignInProgress | string>("github-sign-in-progress", (event) => {
          if (event.payload) useAccountStore.getState().applySignInProgress(event.payload);
        });
      }
      const user = await githubAuthService.signIn();
      const account = await accountService.current();
      set({
        currentAccount: { ...account, provider: "github", username: user.login, displayName: user.name ?? user.login, avatarUrl: user.avatarUrl ?? undefined, onboarded: true },
        githubConnected: true,
        githubUsername: user.login,
        isLoading: false,
        statusMessage: null,
        error: null,
        ...clearedDevice,
      });
      if (options?.ensureRepository === false) return;
      const { useProjectStore } = await import("./projectStore");
      const project = useProjectStore.getState().currentProject;
      if (project) {
        const { ensureGitHubRepository } = await import("../lib/github/ensureRepository");
        void ensureGitHubRepository(project);
      }
    } catch (error) {
      set({
        isLoading: false,
        statusMessage: null,
        error: toErrorMessage(error, "GitHub sign-in failed."),
        ...clearedDevice,
      });
      throw error;
    } finally {
      unlisten();
    }
  },
  signOutGitHub: async () => {
    await githubAuthService.signOut();
    const account = await accountService.current();
    set({ currentAccount: { ...account, provider: "local" }, githubConnected: false, githubUsername: undefined, ...clearedDevice });
  },
  markOnboarded: async () => {
    const account = await accountService.markOnboarded();
    set({ currentAccount: account });
  },
}));
