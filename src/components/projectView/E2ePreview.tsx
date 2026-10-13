import { useEffect, useState } from "react";
import { StatusGlyph } from "../agent/StatusGlyph";
import type { TestLevelProgress, TestProgressCase } from "../../lib/testing/progress";
import { useE2ePreviewStore } from "../../stores/e2ePreviewStore";
import { usePreviewBytes } from "./previewState";

export function E2ePreview() {
  const progress = useE2ePreviewStore((state) => state.progress);
  const dismiss = useE2ePreviewStore((state) => state.dismiss);
  if (!progress) return null;
  const done = progress.passed + progress.failed + progress.skipped;
  const total = progress.total ?? (done > 0 ? done : null);
  const basis = total && total > 0 ? total : Math.max(done, 1);
  const indeterminate = progress.phase === "running" && done === 0 && progress.running === 0;
  const count = total == null ? (done > 0 ? String(done) : "…") : `${done}/${total}`;

  return (
    <div className="e2e-preview">
      <header className="e2e-preview-head">
        <div>
          <strong>E2E</strong>
          <span>{count}</span>
        </div>
        <button type="button" onClick={dismiss}>Show project</button>
      </header>
      <div
        className={`test-progress${indeterminate ? " indeterminate" : ""}`}
        role="progressbar"
        aria-label="E2E"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
      >
        {indeterminate ? <span className="test-progress-indeterminate" /> : (
          <>
            <span className="test-progress-pass" style={{ width: `${(progress.passed / basis) * 100}%` }} />
            <span className="test-progress-fail" style={{ width: `${(progress.failed / basis) * 100}%` }} />
            <span className="test-progress-skip" style={{ width: `${(progress.skipped / basis) * 100}%` }} />
          </>
        )}
      </div>
      <div className="e2e-preview-body">
        <CaseList progress={progress} />
        <Capture image={progress.screenshotPath} video={progress.videoPath} />
      </div>
    </div>
  );
}

function CaseList({ progress }: { progress: TestLevelProgress }) {
  const [showPassed, setShowPassed] = useState(false);
  const running = progress.cases.filter((item) => item.status === "running");
  const failed = progress.cases.filter((item) => item.status === "failed");
  const passed = progress.cases.filter((item) => item.status === "passed");
  if (progress.cases.length === 0) {
    return <p className="e2e-empty">{progress.phase === "running" ? "E2E tests are starting." : "No E2E cases were reported."}</p>;
  }
  return (
    <ul className="test-case-list e2e-cases">
      {running.map((item) => <CaseRow key={item.id} item={item} />)}
      {failed.map((item) => <CaseRow key={item.id} item={item} />)}
      {passed.length > 0 && (
        <li className="test-case passed-toggle">
          <button type="button" onClick={() => setShowPassed((value) => !value)}>{passed.length} passed</button>
          {showPassed && <ul>{passed.map((item) => <li key={item.id}>{item.name}</li>)}</ul>}
        </li>
      )}
    </ul>
  );
}

function CaseRow({ item }: { item: TestProgressCase }) {
  const glyph = item.status === "failed" ? "failed" : item.status === "running" ? "running" : "completed";
  const error = item.error?.split("\n").map((line) => line.trim()).find(Boolean);
  return (
    <li className={`test-case ${item.status}`}>
      <StatusGlyph status={glyph} />
      <span>{item.name}</span>
      {error && <p className="test-case-error">{error}</p>}
    </li>
  );
}

function Capture({ image, video }: { image?: string | null; video?: string | null }) {
  if (video) return <CaptureMedia path={video} kind="video" />;
  if (image) return <CaptureMedia path={image} kind="image" />;
  return <p className="e2e-empty">The page appears here when the test finishes.</p>;
}

function CaptureMedia({ path, kind }: { path: string; kind: "image" | "video" }) {
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
  if (kind === "video") return <video className="e2e-media" src={url} controls autoPlay />;
  return <img className="e2e-media" src={url} alt="E2E capture" />;
}

function mediaType(path: string, kind: "image" | "video") {
  if (kind === "video") return "video/webm";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/png";
}
