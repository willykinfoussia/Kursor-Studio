import { useEffect, useMemo, useState } from "react";
import { fileSystemService } from "../../lib/filesystem/FileSystemService";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useUiStore } from "../../stores/uiStore";

export function QuickOpen() {
  const open = useUiStore((state) => state.quickOpen);
  const setOpen = useUiStore((state) => state.setQuickOpen);
  const knownFiles = useFileExplorerStore((state) => state.knownFiles);
  const openFile = useEditorStore((state) => state.openFile);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const results = useMemo(
    () => fileSystemService.searchFiles(query, knownFiles()).slice(0, 40),
    [query, knownFiles, open],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  if (!open) return null;

  const choose = (path: string) => {
    void openFile(path);
    setOpen(false);
  };

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette-card" onClick={(event) => event.stopPropagation()}>
        <div className="palette-title">Quick Open</div>
        <input
          className="palette-input"
          autoFocus
          value={query}
          placeholder="App.tsx"
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(results.length - 1, value + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
            if (event.key === "Enter" && results[index]) choose(results[index].relativePath);
          }}
        />
        <div className="palette-list">
          {results.map((file, offset) => (
            <button
              type="button"
              key={file.relativePath}
              className={`palette-item ${offset === index ? "active" : ""}`}
              onClick={() => choose(file.relativePath)}
            >
              <strong>{file.name}</strong>
              <span>{file.relativePath}</span>
            </button>
          ))}
          {results.length === 0 && <div className="palette-empty">No matching files in the loaded tree.</div>}
        </div>
      </div>
    </div>
  );
}
