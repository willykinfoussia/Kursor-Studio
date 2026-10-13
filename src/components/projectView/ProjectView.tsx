import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Code2, ExternalLink, Eye, EyeOff, FolderOpen } from "lucide-react";
import { artifactCursor } from "../../lib/projectView/artifacts";
import type { ProjectArtifact } from "../../lib/projectView/types";
import { openArtifactExternal, revealArtifact } from "../../lib/projectView/openArtifact";
import { useE2ePreviewStore } from "../../stores/e2ePreviewStore";
import { useProjectViewStore } from "../../stores/projectViewStore";
import { IconButton } from "../ui/Controls";
import { E2ePreview } from "./E2ePreview";
import { FilePreview } from "./FilePreview";
import { PreviewMessage, WebPreview } from "./previewState";

export function ProjectView() {
  const artifacts = useProjectViewStore((state) => state.artifacts);
  const activeArtifactId = useProjectViewStore((state) => state.activeArtifactId);
  const step = useProjectViewStore((state) => state.step);
  const hide = useProjectViewStore((state) => state.hide);
  const follow = useProjectViewStore((state) => state.follow);
  const control = useProjectViewStore((state) => state.control);
  const openCode = useProjectViewStore((state) => state.openCode);
  const e2eVisible = useE2ePreviewStore((state) => state.visible);
  const e2eAnchor = useE2ePreviewStore((state) => state.anchorId);
  const active = artifacts.find((artifact) => artifact.artifactId === activeArtifactId) ?? artifacts[0] ?? null;
  const cursor = artifactCursor(artifacts, active?.artifactId ?? null);
  useEffect(() => {
    if (!e2eVisible) return;
    if (e2eAnchor !== activeArtifactId) useE2ePreviewStore.getState().dismiss();
  }, [activeArtifactId, e2eAnchor, e2eVisible]);

  return (
    <section className="project-view" aria-label="Project">
      <header className="project-view-toolbar">
        <div className="project-view-nav">
          <IconButton icon={ChevronLeft} label="Previous artifact" disabled={!cursor.canPrev} onClick={() => step(-1)} />
          <IconButton icon={ChevronRight} label="Next artifact" disabled={!cursor.canNext} onClick={() => step(1)} />
          <span className="project-view-name" title={active?.path || active?.name}>
            {active?.name ?? "Project"}
            {cursor.count > 1 && cursor.index >= 0 && <em>{cursor.index + 1} / {cursor.count}</em>}
          </span>
        </div>
        <div className="project-view-tools">
          {active?.path && (
            <>
              <IconButton icon={ExternalLink} label="Open externally" onClick={() => void openArtifactExternal(active.path)} />
              <IconButton icon={FolderOpen} label="Reveal in file manager" onClick={() => void revealArtifact(active.path)} />
            </>
          )}
          <IconButton icon={Code2} label="Code editor" onClick={openCode} />
          {control === "manual"
            ? <IconButton icon={Eye} label="Follow project results" onClick={follow} />
            : <IconButton icon={EyeOff} label="Hide project view" onClick={hide} />}
        </div>
      </header>
      <div className="project-view-body">
        {e2eVisible ? <E2ePreview /> : <ProjectBody artifact={active} />}
      </div>
    </section>
  );
}

function ProjectBody({ artifact }: { artifact: ProjectArtifact | null }) {
  if (!artifact) {
    return <PreviewMessage title="Nothing to preview" body="Kursor will open this view when a result can be shown." />;
  }
  if (artifact.kind === "web-app") return <WebPreview artifact={artifact} />;
  return <FilePreview artifact={artifact} />;
}
