import { useEffect, useState, type ReactNode } from "react";
import { fileSystemService } from "../../lib/filesystem/FileSystemService";
import { previewFrameUrl } from "../../lib/projectView/runtime";
import type { ProjectArtifact } from "../../lib/projectView/types";
import { useProjectViewStore } from "../../stores/projectViewStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { requestPreviewLaunch } from "../../lib/projectView/session";

export function WebPreview({ artifact }: { artifact: ProjectArtifact }) {
  const runtime = useProjectViewStore((state) => state.runtime);
  const launchCommand = useProjectViewStore((state) => state.launchCommand);
  const openCode = useProjectViewStore((state) => state.openCode);
  const command = runtime.command ?? launchCommand;

  if (runtime.status === "starting" || runtime.status === "approval") {
    return (
      <PreviewMessage
        title={runtime.status === "approval" ? "Waiting for approval" : "Starting the application"}
        body={command ? `Kursor is preparing ${command}.` : "The preview runtime is starting."}
      />
    );
  }

  if (runtime.status === "ready" && runtime.url) {
    return <iframe className="project-view-frame" title={artifact.name} src={previewFrameUrl(runtime.url)} />;
  }

  if (runtime.status === "error") {
    return (
      <PreviewMessage
        title="The application did not start"
        body={runtime.error ?? "Preview failed."}
        log={runtime.log}
        actions={
          <>
            {command && <button type="button" className="project-view-action" onClick={() => void requestPreviewLaunch(true)}>Try again</button>}
            <button type="button" className="project-view-action secondary" onClick={() => { useTerminalStore.setState({ visible: true }); openCode(); }}>Open terminal</button>
          </>
        }
      />
    );
  }

  if (runtime.status === "stopped") {
    return (
      <PreviewMessage
        title="Application stopped"
        body={command ? `The preview process for ${command} is no longer running.` : "The preview process is no longer running."}
        log={runtime.log}
        actions={command ? <button type="button" className="project-view-action" onClick={() => void requestPreviewLaunch(true)}>Relaunch</button> : null}
      />
    );
  }

  return (
    <PreviewMessage
      title="Ready to launch"
      body={runtime.error ?? (command ? `Start ${command} to preview the application. This still asks for permission.` : "No launch command was found.")}
      actions={command ? <button type="button" className="project-view-action" onClick={() => void requestPreviewLaunch(true)}>Launch</button> : null}
    />
  );
}

export function PreviewMessage({
  title,
  body,
  log,
  actions,
}: {
  title: string;
  body: string;
  log?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="project-view-status">
      <strong>{title}</strong>
      <p>{body}</p>
      {actions && <div className="project-view-actions">{actions}</div>}
      {log?.trim() && <pre className="project-view-log">{log.trim()}</pre>}
    </div>
  );
}

export function usePreviewText(path: string) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    void fileSystemService.readFile(path).then(
      (value) => { if (!cancelled) setText(value); },
      (reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to read this file."); },
    );
    return () => { cancelled = true; };
  }, [path]);
  return { text, error };
}

export function usePreviewBytes(path: string) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBytes(null);
    setError(null);
    void fileSystemService.readBytes(path).then(
      (value) => { if (!cancelled) setBytes(value); },
      (reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to read this file."); },
    );
    return () => { cancelled = true; };
  }, [path]);
  return { bytes, error };
}
