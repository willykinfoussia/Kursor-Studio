import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 800);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button type="button" className="copy-btn" onClick={() => void onCopy()} aria-label={copied ? "Copied" : label}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : label}
    </button>
  );
}
