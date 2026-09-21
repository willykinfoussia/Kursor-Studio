import { useCallback } from "react";
import type { AnchorHTMLAttributes } from "react";

export function MarkdownLink({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const onClick = useCallback(async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    event.preventDefault();
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(href);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [href]);

  return (
    <a href={href} className="md-link" onClick={(event) => void onClick(event)} rel="noreferrer" {...props}>
      {children}
    </a>
  );
}
