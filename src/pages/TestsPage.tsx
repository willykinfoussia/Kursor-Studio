import { useEffect, useMemo, useState } from "react";
import { countsFromReport, overlayFromInspection } from "../lib/agent/verification";
import { useProjectStore } from "../stores/projectStore";
import { useVerificationStore } from "../stores/verificationStore";
import { useEditorStore } from "../stores/editorStore";
import { useUiStore } from "../stores/uiStore";
import { openTests, openWorkflowNode } from "../lib/workflow/navigation";
import { VerificationHeader } from "../components/verification/VerificationHeader";
import { VerificationHealth } from "../components/verification/VerificationHealth";
import { VerificationStats } from "../components/verification/VerificationStats";
import { VerificationSuite } from "../components/verification/VerificationSuite";
import { VerificationDetails } from "../components/verification/VerificationDetails";
import { VerificationHistory } from "../components/verification/VerificationHistory";
import { VerificationGaps } from "../components/verification/VerificationGaps";
import { CoveragePanel } from "../components/verification/CoveragePanel";
import { VerifiedFunctionality } from "../components/verification/VerifiedFunctionality";
import { AddCheckDialog, CheckEditor } from "../components/verification/CheckEditor";
import type { SuiteItem, SuiteStatus } from "../lib/agent/verification";

export function TestsPage() {
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const inspection = useVerificationStore((state) => state.inspection);
  const lastReport = useVerificationStore((state) => state.lastReport);
  const history = useVerificationStore((state) => state.history);
  const running = useVerificationStore((state) => state.running);
  const stopping = useVerificationStore((state) => state.stopping);
  const loading = useVerificationStore((state) => state.loading);
  const error = useVerificationStore((state) => state.error);
  const selectedId = useVerificationStore((state) => state.selectedId);
  const detailsOpen = useVerificationStore((state) => state.detailsOpen);
  const editorOpen = useVerificationStore((state) => state.editorOpen);
  const addOpen = useVerificationStore((state) => state.addOpen);
  const health = useVerificationStore((state) => state.health);
  const suite = useVerificationStore((state) => state.suite);
  const gaps = useVerificationStore((state) => state.gaps);
  const ecosystem = useVerificationStore((state) => state.ecosystem);
  const runningId = useVerificationStore((state) => state.runningId);
  const trigger = useVerificationStore((state) => state.trigger);
  const requestId = useVerificationStore((state) => state.requestId);
  const refresh = useVerificationStore((state) => state.refresh);
  const runAll = useVerificationStore((state) => state.runAll);
  const runItem = useVerificationStore((state) => state.runItem);
  const stop = useVerificationStore((state) => state.stop);
  const saveOverlay = useVerificationStore((state) => state.saveOverlay);
  const select = useVerificationStore((state) => state.select);
  const setEditorOpen = useVerificationStore((state) => state.setEditorOpen);
  const setAddOpen = useVerificationStore((state) => state.setAddOpen);
  const [statFilter, setStatFilter] = useState<"checks" | "passed" | "failed" | "skipped" | "blocked">("checks");

  useEffect(() => {
    void refresh();
  }, [refresh, projectId]);

  const visibleSuite = useMemo(() => {
    if (statFilter === "checks") return suite;
    return suite.filter((item) => item.status === statFilter);
  }, [suite, statFilter]);
  const selected = suite.find((item) => item.id === selectedId) ?? null;
  const counts = countsFromReport(lastReport);
  const runnable = suite.filter((item) => item.status !== "disabled" && item.status !== "not-configured");
  const finished = runnable.filter((item) => !isPending(item.status)).length;
  const current = suite.find((item) => item.id === runningId)?.command ?? suite.find((item) => item.status === "running")?.command;
  const lastVerified = history.find((entry) => !entry.cancelled)?.timestamp ?? history[0]?.timestamp ?? null;

  const mutateItem = async (item: SuiteItem, action: "disable" | "delete") => {
    if (!inspection) return;
    if (action === "delete" && !window.confirm(`Delete ${item.name}?`)) return;
    if (action === "disable" && item.origin !== "disabled" && !window.confirm(`Disable ${item.name}?`)) return;
    if (item.kind === "custom") {
      const keep = action === "disable" && item.origin === "disabled";
      const custom = keep
        ? [...(inspection.overlay.custom ?? []), { name: item.name, command: item.command ?? "" }]
        : (inspection.overlay.custom ?? []).filter((row) => row.name !== item.name && row.command !== item.command);
      await saveOverlay(overlayFromInspection(inspection, {
        custom,
        expectedFiles: inspection.overlay.expectedFiles,
      }));
      return;
    }
    if (item.kind === "files") {
      const expectedFiles = action === "delete" || (action === "disable" && item.origin !== "disabled")
        ? (inspection.overlay.expectedFiles ?? []).filter((path) => path !== item.path)
        : inspection.overlay.expectedFiles;
      await saveOverlay(overlayFromInspection(inspection, { expectedFiles, custom: inspection.overlay.custom }));
      return;
    }
    await saveOverlay(overlayFromInspection(inspection, {
      toggles: { [item.kind]: item.origin === "disabled" ? undefined : false },
      custom: inspection.overlay.custom,
      expectedFiles: inspection.overlay.expectedFiles,
    }));
  };

  return (
    <div className={`verify-workspace${detailsOpen ? " details-open" : ""}`}>
      <VerificationHeader
        running={running}
        stopping={stopping}
        progress={running ? `${finished} / ${Math.max(runnable.length, 1)} checks` : null}
        current={current}
        onRun={() => void runAll()}
        onStop={stop}
        onConfigure={() => setEditorOpen(true)}
        onAdd={() => setAddOpen(true)}
        disabled={!projectId}
      />
      {error && <div className="cap-error-banner">{error}</div>}
      {!projectId ? (
        <div className="verify-empty">
          <h3>No project open</h3>
          <p>Open a project to inspect its verification suite.</p>
        </div>
      ) : loading && !inspection ? (
        <div className="verify-stats" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <div className="verify-stat cap-skeleton-stat" key={index} />)}
        </div>
      ) : (
        <>
          <VerificationHealth health={health} />
          <p className="verify-detected">Detected from project · {ecosystem}{inspection?.detectedFrom.length ? ` · ${inspection.detectedFrom.join(", ")}` : ""}</p>
          <VerificationStats counts={counts} lastVerified={lastVerified} onSelect={setStatFilter} />
          <div className="verify-body">
            <div className="verify-main">
              <VerificationSuite
                items={visibleSuite}
                selectedId={selectedId}
                running={running}
                onSelect={(id) => select(id)}
                onRun={(item) => void runItem(item)}
                onEdit={() => setEditorOpen(true)}
                onDisable={(item) => void mutateItem(item, "disable")}
                onDelete={(item) => void mutateItem(item, "delete")}
              />
              <VerificationGaps gaps={gaps} onConfigure={() => setEditorOpen(true)} />
              <VerificationHistory history={history} />
              <CoveragePanel />
              <VerifiedFunctionality />
            </div>
            {detailsOpen && (
              <>
                <button type="button" className="verify-details-backdrop" aria-label="Close details" onClick={() => select(null)} />
                <VerificationDetails
                  item={selected}
                  trigger={trigger}
                  requestId={requestId}
                  executedAt={lastVerified}
                  onClose={() => select(null)}
                  onOpenFile={(path) => {
                    useUiStore.getState().setView("project");
                    void useEditorStore.getState().openFile(path);
                  }}
                  onOpenWorkflow={() => {
                    if (requestId) openWorkflowNode(`verification:${requestId}`);
                    else openTests();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
      {editorOpen && inspection && (
        <CheckEditor
          inspection={inspection}
          onSave={(overlay) => void saveOverlay(overlay)}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {addOpen && inspection && (
        <AddCheckDialog
          onClose={() => setAddOpen(false)}
          onAdd={(kind, value) => {
            if (kind === "custom" && value.command) {
              void saveOverlay(overlayFromInspection(inspection, {
                custom: [...(inspection.overlay.custom ?? []), { name: value.name || value.command, command: value.command }],
                expectedFiles: inspection.overlay.expectedFiles,
              }));
            }
            if (kind === "file" && value.path) {
              void saveOverlay(overlayFromInspection(inspection, {
                custom: inspection.overlay.custom,
                expectedFiles: [...(inspection.overlay.expectedFiles ?? []), value.path],
              }));
            }
          }}
        />
      )}
    </div>
  );
}

function isPending(status: SuiteStatus) {
  return status === "waiting" || status === "running" || status === "idle";
}
