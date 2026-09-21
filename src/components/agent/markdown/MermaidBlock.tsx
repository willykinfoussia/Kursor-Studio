import { useEffect, useId, useRef, useState } from "react";

let mermaidReady = false;

export function MermaidBlock({ code }: { code: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!mermaidReady) {
          mermaid.initialize({ theme: "dark", startOnLoad: false });
          mermaidReady = true;
        }
        const { svg } = await mermaid.render(`mermaid-${reactId}`, code);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [code, reactId]);

  return (
    <div className="mermaid-block">
      {failed ? <pre className="mermaid-fallback">{code}</pre> : <div ref={hostRef} className="mermaid-svg" />}
    </div>
  );
}
