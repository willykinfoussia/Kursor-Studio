import { useState } from "react";
import { Bot, Check, Plus, Wrench } from "lucide-react";
import { agents as initialAgents } from "../data/mockData";
import { Toggle } from "../components/ui/Controls";

export function AgentsPage() {
  const [agents, setAgents] = useState(initialAgents);

  return (
    <main className="page">
      <header className="page-heading">
        <div><h1 className="page-title">Agents</h1><div className="page-subtitle">Specialized workers available to this workspace.</div></div>
        <button className="primary-btn" type="button"><Plus size={13} /> Create Agent</button>
      </header>
      <div className="agent-grid">
        {agents.map((agent) => (
          <article className="agent-card" key={agent.id}>
            <div className="card-header">
              <div className="card-agent-icon"><Bot size={16} /></div>
              <div><div className="card-title">{agent.name}</div><div className="agent-state">{agent.enabled ? "AVAILABLE" : "DISABLED"}</div></div>
              <Toggle checked={agent.enabled} label={`${agent.name} status`} onChange={(enabled) => setAgents((items) => items.map((item) => item.id === agent.id ? { ...item, enabled } : item))} />
            </div>
            <p className="card-description">{agent.description}</p>
            <div className="tool-tags">
              {agent.tools.map((tool) => <span className="tool-tag" key={tool}><Wrench size={10} /><span>{tool}</span><Check size={9} style={{ color: "var(--green)" }} /></span>)}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
