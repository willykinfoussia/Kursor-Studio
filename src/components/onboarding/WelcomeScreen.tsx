import { Command } from "lucide-react";
import { useAccountStore } from "../../stores/accountStore";

export function WelcomeScreen({ onReady }: { onReady: () => void }) {
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const continueLocal = useAccountStore((state) => state.continueLocal);
  const isLoading = useAccountStore((state) => state.isLoading);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const error = useAccountStore((state) => state.error);

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="brand-mark welcome-mark"><Command size={22} strokeWidth={2} /></div>
        <h1>KURSOR</h1>
        <p>Your AI Development Environment</p>
        {error && <div className="welcome-error">{error}</div>}
        {statusMessage && !error && <div className="welcome-status">{statusMessage}</div>}
        <button
          type="button"
          className="welcome-btn primary"
          disabled={isLoading}
          onClick={() => { void signInGitHub().then(onReady).catch(() => undefined); }}
        >
          {isLoading ? (statusMessage ?? "Opening GitHub…") : "Continue with GitHub"}
        </button>
        <button
          type="button"
          className="welcome-btn"
          disabled={isLoading}
          onClick={() => { void continueLocal().then(onReady); }}
        >
          Continue locally
        </button>
      </div>
    </div>
  );
}
