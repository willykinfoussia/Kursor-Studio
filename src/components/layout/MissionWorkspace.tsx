import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampSplit } from "../../lib/projectView/runtime";
import { useProjectViewStore } from "../../stores/projectViewStore";
import { AgentPanel } from "../agent/AgentPanel";
import { PlanEditorView } from "../plans/PlanEditorView";
import { ProjectView } from "../projectView/ProjectView";
import { CodeStage } from "./CodeStage";

export function MissionWorkspace() {
  const surface = useProjectViewStore((state) => state.surface);
  const planPath = useProjectViewStore((state) => state.planPath);
  const splitPercent = useProjectViewStore((state) => state.splitPercent);
  const setSplit = useProjectViewStore((state) => state.setSplit);
  const openProject = useProjectViewStore((state) => state.openProject);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const percent = dragging ?? splitPercent;
  const solo = surface === "chat";

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    const bounds = root.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const next = ((bounds.right - pointer.clientX) / bounds.width) * 100;
      setDragging(clampSplit(next, bounds.width));
    };
    const up = (pointer: PointerEvent) => {
      const next = clampSplit(((bounds.right - pointer.clientX) / bounds.width) * 100, bounds.width);
      setDragging(null);
      setSplit(next, bounds.width);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={`mission-workspace${solo ? " is-solo" : ""}`} ref={rootRef}>
      {!solo && (
        <>
          <div className="mission-stage">
            {surface === "code" ? <CodeStage /> : planPath ? <PlanEditorView path={planPath} onBackToProject={openProject} /> : <ProjectView />}
          </div>
          <div
            className="resize-handle horizontal"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat and project"
            onPointerDown={onPointerDown}
          />
        </>
      )}
      <div className="mission-chat" style={solo ? undefined : { width: `${percent}%` }}>
        <AgentPanel />
      </div>
    </div>
  );
}
