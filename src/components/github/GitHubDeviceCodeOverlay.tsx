import { useEffect, useState } from "react";
import { useAccountStore } from "../../stores/accountStore";
import { openExternalUrl } from "../../lib/tauri/openUrl";

const DEFAULT_DEVICE_URI = "https://github.com/login/device";

export function GitHubDeviceCodeOverlay() {
  const deviceUserCode = useAccountStore((state) => state.deviceUserCode);
  const deviceVerificationUri = useAccountStore((state) => state.deviceVerificationUri);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [deviceUserCode]);

  if (!deviceUserCode) return null;

  const uri = deviceVerificationUri || DEFAULT_DEVICE_URI;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(deviceUserCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-backdrop github-device-overlay" role="dialog" aria-modal="true" aria-labelledby="github-device-title">
      <div className="modal-card github-device-card">
        <h3 id="github-device-title">Enter this code on GitHub</h3>
        <p>GitHub is asking for the code displayed in Kursor. Type it on the device page that just opened.</p>
        <div className="github-device-code" aria-live="polite">{deviceUserCode}</div>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={() => void copyCode()}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <button type="button" className="modal-btn primary" onClick={() => void openExternalUrl(uri)}>
            Open GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
