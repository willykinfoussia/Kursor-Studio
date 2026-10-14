import { useEffect, useState } from "react";
import { usePreviewBytes } from "../projectView/previewState";

export function CaptureMedia({ path, kind, autoPlay = false }: { path: string; kind: "image" | "video"; autoPlay?: boolean }) {
  const { bytes, error } = usePreviewBytes(path);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return;
    const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mediaType(path, kind) }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, kind, path]);
  if (error) return <p className="e2e-empty">{error}</p>;
  if (!url) return <p className="e2e-empty">Loading capture…</p>;
  if (kind === "video") return <video className="e2e-media" src={url} controls autoPlay={autoPlay} />;
  return <img className="e2e-media" src={url} alt="Test capture" />;
}

function mediaType(path: string, kind: "image" | "video") {
  if (kind === "video") return /\.mp4$/i.test(path) ? "video/mp4" : "video/webm";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/png";
}
