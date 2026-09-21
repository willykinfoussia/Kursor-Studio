import { useEffect, useMemo, useState } from "react";
import { ListTodo, Plus } from "lucide-react";
import { MarkdownRenderer } from "../agent/markdown/MarkdownRenderer";
import { MarkdownDocumentView } from "../editor/MarkdownDocumentView";
import { buildPlan, isPlanBuildable } from "../../lib/agent/plans/buildPlan";
import { serializePlanFile } from "../../lib/agent/plans/planFile";
import type { PlanTodoStatus } from "../../lib/agent/plans/types";
import { planByPath, usePlanStore } from "../../stores/planStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAgentStore } from "../../stores/agentStore";

function nextUserTodoStatus(status: PlanTodoStatus): PlanTodoStatus {
  return status === "completed" ? "pending" : "completed";
}

export function PlanEditorView({ path }: { path: string }) {
  const plan = usePlanStore((state) => planByPath(state, path));
  const loadPlan = usePlanStore((state) => state.loadPlan);
  const setTodoStatus = usePlanStore((state) => state.setTodoStatus);
  const addTodo = usePlanStore((state) => state.addTodo);
  const setActivePlan = usePlanStore((state) => state.setActivePlan);
  const tab = useEditorStore((state) => state.tabs.find((item) => item.path === path));
  const startRaw = useEditorStore((state) => state.pendingReveal?.path === path);
  const isStreaming = useAgentStore((state) => state.isStreaming);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) void loadPlan(path);
  }, [plan, path, loadPlan]);

  const fileName = useMemo(() => path.split("/").pop() ?? path, [path]);

  if (!plan) {
    return (
      <div className="md-doc-editor">
        <p className="md-doc-loading">Loading plan…</p>
      </div>
    );
  }

  const buildable = isPlanBuildable(plan, isStreaming);
  const busy = building || isStreaming;

  const onBuild = async () => {
    if (!buildable || busy) return;
    setBuilding(true);
    setError(null);
    try {
      setActivePlan(plan.id);
      const result = await buildPlan(plan.id);
      if (!result.ok) setError(result.message);
    } finally {
      setBuilding(false);
    }
  };

  const submitTodo = () => {
    const content = draft.trim();
    if (!content) return;
    void addTodo(plan.id, content);
    setDraft("");
    setAdding(false);
  };

  return (
    <MarkdownDocumentView
      key={plan.path}
      path={plan.path}
      content={tab?.content ?? serializePlanFile(plan)}
      pathLabel={<><ListTodo size={12} /> Plans › {fileName}</>}
      viewLabel="Plan view"
      defaultRaw={startRaw}
      extraActions={(
        <button
          type="button"
          className="plan-build-btn"
          disabled={!buildable || busy}
          aria-keyshortcuts="Control+Enter"
          onClick={() => void onBuild()}
        >
          {plan.status === "building" && isStreaming ? "Building…" : plan.status === "done" ? "Done" : "Build"}
          {buildable && !busy && <kbd>Ctrl+↵</kbd>}
        </button>
      )}
      banner={error ? <p className="plan-card-error md-doc-error" role="alert">{error}</p> : null}
    >
      <h1 className="md-doc-title">{plan.name}</h1>
      {plan.overview && <p className="md-doc-overview">{plan.overview}</p>}
      {plan.body.trim() && <MarkdownRenderer content={plan.body} knownPath={plan.path} />}
      <div className="plan-editor-todos-head">
        <span>{plan.todos.length} To-do{plan.todos.length === 1 ? "" : "s"}</span>
        <button type="button" className="plan-editor-new" onClick={() => setAdding((value) => !value)}>
          <Plus size={12} /> New
        </button>
      </div>
      {adding && (
        <div className="plan-editor-add">
          <input
            autoFocus
            value={draft}
            placeholder="New todo…"
            aria-label="New todo"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitTodo();
              if (event.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
          />
          <button type="button" className="permission-allow" onClick={submitTodo}>Add</button>
        </div>
      )}
      <ul className="plan-editor-todos">
        {plan.todos.map((todo) => (
          <li key={todo.id}>
            <button
              type="button"
              className={`plan-todo status-${todo.status}`}
              title={todo.status === "completed" ? "Mark pending" : "Mark completed"}
              onClick={() => void setTodoStatus(plan.id, todo.id, nextUserTodoStatus(todo.status))}
            >
              <span className="plan-todo-check" aria-hidden />
              <span className="plan-todo-content">{todo.content}</span>
              {todo.status === "in_progress" && <span className="plan-todo-flag">In progress</span>}
              {todo.status === "cancelled" && <span className="plan-todo-flag">Cancelled</span>}
            </button>
          </li>
        ))}
      </ul>
      {plan.todos.length === 0 && (
        <p className="plan-editor-empty">No todos yet. Add one with + New.</p>
      )}
    </MarkdownDocumentView>
  );
}
