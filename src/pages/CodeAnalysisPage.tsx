import { useState, type FormEvent } from "react";
import { Network } from "lucide-react";
import { useCodeIntel } from "../hooks/useCodeIntel";
import { INSTALLING_DETAIL } from "../lib/codeIntel/commands";
import type { CodeIntelEngine } from "../lib/codeIntel/session";
import { codeIntelSession } from "../lib/codeIntel/session";

function statusLabel(engine: CodeIntelEngine): string {
  if (engine.status === "missing") return "Not installed";
  if (engine.status === "starting") return engine.detail === INSTALLING_DETAIL ? "Installing" : "Indexing";
  if (engine.status === "ready") return "Ready";
  if (engine.status === "error") return "Error";
  return "Idle";
}

export function CodeAnalysisPage() {
  const intel = useCodeIntel();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [searching, setSearching] = useState(false);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    try {
      setResult(await codeIntelSession.search(query));
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="code-graph-page">
      <header className="code-graph-heading">
        <div>
          <h1 className="page-title">Code Graph</h1>
          <div className="page-subtitle">CodeGraph for symbols and calls. Graphify for the project map.</div>
        </div>
        <div className="code-graph-pills">
          <span className={`code-graph-pill ${intel.codegraph.status}`}>CodeGraph · {statusLabel(intel.codegraph)}</span>
          <span className={`code-graph-pill ${intel.graphify.status}`}>Graphify · {statusLabel(intel.graphify)}</span>
        </div>
      </header>

      {(intel.codegraph.detail || intel.graphify.detail) && (
        <div className="code-graph-details">
          {intel.codegraph.detail && <p>CodeGraph: {intel.codegraph.detail}</p>}
          {intel.graphify.detail && <p>Graphify: {intel.graphify.detail}</p>}
        </div>
      )}

      {intel.needsDocUpdate && (
        <div className="code-graph-banner">
          <span>Documents changed. The code graph is current. A document pass sends those files to the configured model.</span>
          <button
            type="button"
            className="primary-btn"
            disabled={intel.updatingDocs || intel.graphify.status !== "ready"}
            onClick={() => void codeIntelSession.updateDocuments()}
          >
            {intel.updatingDocs ? "Updating…" : "Mettre à jour les documents"}
          </button>
        </div>
      )}

      <div className="code-graph-body">
        <section className="code-graph-canvas">
          {intel.html ? (
            <iframe title="Graphify graph" srcDoc={intel.html} />
          ) : (
            <div className="code-graph-empty">
              <Network size={40} strokeWidth={1.5} />
              <p>{intel.htmlError ?? "The Graphify map appears here after the first code index."}</p>
            </div>
          )}
        </section>
        <aside className="code-graph-side">
          <h2>Symbols, callers, impact</h2>
          <form onSubmit={(event) => void onSearch(event)}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Symbol or question"
              aria-label="CodeGraph query"
            />
            <button type="submit" className="primary-btn" disabled={searching || intel.codegraph.status !== "ready"}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          <pre>{result}</pre>
        </aside>
      </div>
    </main>
  );
}
