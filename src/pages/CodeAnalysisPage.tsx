import { Network } from "lucide-react";

export function CodeAnalysisPage() {
  return (
    <main className="page">
      <header className="page-heading">
        <div>
          <h1 className="page-title">Code Analysis</h1>
          <div className="page-subtitle">
            Codebase structure and dependency visualization. Analysis engine (graphify/codegraph) coming soon.
          </div>
        </div>
      </header>
      <div className="empty-state">
        <Network size={48} strokeWidth={1.5} style={{ opacity: 0.3 }} />
        <p style={{ marginTop: "1rem", opacity: 0.6 }}>Analysis view under construction</p>
      </div>
    </main>
  );
}
