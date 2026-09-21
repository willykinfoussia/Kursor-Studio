import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Square, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { tauriTerminalService } from "../../lib/terminal/TauriTerminalService";
import { useTerminalService } from "../../hooks/useTerminalService";
import { useProjectStore } from "../../stores/projectStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { IconButton } from "../ui/Controls";
import "@xterm/xterm/css/xterm.css";

function applyTerminalFit(term: Terminal, fit: FitAddon, sessionId: string, host: HTMLElement) {
  if (host.hidden || !term.element) return;
  const layout = host.parentElement ?? host;
  if (layout.clientWidth < 20 || layout.clientHeight < 20) return;
  const prevCols = term.cols;
  const prevRows = term.rows;
  try {
    fit.fit();
  } catch {
    return;
  }
  if (term.cols < 2 || term.rows < 2) return;
  if (term.cols === prevCols && term.rows === prevRows) return;
  void tauriTerminalService.resize(sessionId, term.cols, term.rows);
}

function SessionTerminal({ sessionId, active }: { sessionId: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      theme: {
        background: "#0b0e13",
        foreground: "#c4cad5",
        cursor: "#a99fff",
        selectionBackground: "#40396b80",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    applyTerminalFit(term, fit, sessionId, host);

    const dataSub = term.onData((data) => {
      void tauriTerminalService.write(sessionId, data);
    });
    const unlistenOutput = tauriTerminalService.onOutput((id, data) => {
      if (id === sessionId) term.write(data);
    });
    let disposed = false;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (disposed || !term.element) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed || !term.element) return;
        applyTerminalFit(term, fit, sessionId, host);
      });
    });
    observer.observe(host.parentElement ?? host);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      dataSub.dispose();
      unlistenOutput();
      observer.disconnect();
      try {
        term.dispose();
      } catch {
        /* already torn down */
      }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const host = hostRef.current;
    if (term && fit && host) applyTerminalFit(term, fit, sessionId, host);
  }, [active, sessionId]);

  return <div className="xterm-host" ref={hostRef} hidden={!active} />;
}

export function TerminalPanel() {
  useTerminalService();
  const sessions = useTerminalStore((state) => state.sessions);
  const activeId = useTerminalStore((state) => state.activeId);
  const createSession = useTerminalStore((state) => state.createSession);
  const ensureSessionForCurrentProject = useTerminalStore((state) => state.ensureSessionForCurrentProject);
  const setActive = useTerminalStore((state) => state.setActive);
  const closeSession = useTerminalStore((state) => state.closeSession);
  const closePanel = useTerminalStore((state) => state.closePanel);
  const killActive = useTerminalStore((state) => state.killActive);
  const creating = useTerminalStore((state) => state.creating);
  const status = useTerminalStore((state) => state.status);
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const session = sessions.find((item) => item.id === activeId) ?? sessions[0];

  useEffect(() => {
    if (!projectId) return;
    void ensureSessionForCurrentProject();
  }, [projectId, ensureSessionForCurrentProject]);

  return (
    <section className="terminal">
      <header className="terminal-header">
        <div className="terminal-title">
          <TerminalIcon size={13} /> TERMINAL
          {sessions.map((item) => (
            <div className={`terminal-tab ${item.id === activeId ? "active" : ""}`} key={item.id}>
              <button type="button" onClick={() => setActive(item.id)}>
                {item.name}{item.status === "running" ? " ●" : ""}
              </button>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`Close ${item.name}`}
                onClick={() => void closeSession(item.id)}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="terminal-actions">
          {session?.status === "running" && (
            <button type="button" className="stop-btn terminal-stop" onClick={() => void killActive()}>
              <Square size={9} fill="currentColor" /> Stop
            </button>
          )}
          <IconButton icon={Plus} label="Nouveau terminal" size={13} onClick={() => void createSession()} />
          <IconButton icon={X} label="Fermer le terminal" size={13} onClick={closePanel} />
        </div>
      </header>
      <div className="terminal-xterm">
        {sessions.map((item) => (
          <SessionTerminal key={item.id} sessionId={item.id} active={item.id === activeId} />
        ))}
        {creating && <div className="terminal-status">Starting terminal...</div>}
        {!creating && sessions.length === 0 && <div className="terminal-status">{status ?? "Open a project to start a terminal."}</div>}
        {session?.status === "exited" && (
          <div className="terminal-exit">Process exited with code {session.exitCode ?? 0}</div>
        )}
        {status && sessions.length > 0 && <div className="terminal-status error">{status}</div>}
      </div>
    </section>
  );
}
