import { useEffect, useMemo, useRef } from "react";
import { Filter } from "lucide-react";
import { useGitStore, visibleGitFiles } from "../../stores/gitStore";
import { dirName, fileName } from "../../lib/git/format";
import { CommitPanel } from "./CommitPanel";

export function GitChangesPanel() {
  const status = useGitStore((state) => state.status);
  const query = useGitStore((state) => state.changeQuery);
  const selectedPaths = useGitStore((state) => state.selectedPaths);
  const activePath = useGitStore((state) => state.activePath);
  const files = useMemo(
    () => visibleGitFiles(useGitStore.getState()),
    [status, query],
  );
  const setChangeQuery = useGitStore((state) => state.setChangeQuery);
  const setSelectedPaths = useGitStore((state) => state.setSelectedPaths);
  const selectFile = useGitStore((state) => state.selectFile);
  const toggleSelected = useGitStore((state) => state.toggleSelected);
  const allSelected = files.length > 0 && files.every((file) => selectedPaths.includes(file.path));
  const someSelected = files.some((file) => selectedPaths.includes(file.path));
  const masterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);

  return (
    <div className="git-changes">
      <div className="git-filter">
        <Filter size={12} />
        <input
          value={query}
          onChange={(event) => setChangeQuery(event.target.value)}
          placeholder="Filter"
        />
      </div>
      <label className="git-changed-toggle">
        <input
          ref={masterRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => setSelectedPaths(allSelected ? [] : files.map((file) => file.path))}
        />
        <span>{files.length} changed files</span>
      </label>
      <div className="git-file-list">
        {files.map((file) => (
          <div key={file.path} className={`git-file-row${activePath === file.path ? " active" : ""}`}>
            <input type="checkbox" checked={selectedPaths.includes(file.path)} onChange={() => toggleSelected(file.path)} />
            <button type="button" className="git-file-main" onClick={() => void selectFile(file.path)}>
              <span className="git-file-name">{fileName(file.path)}</span>
              {dirName(file.path) ? <span className="git-file-path">{dirName(file.path)}</span> : null}
              <span className={`git-kind git-kind-${file.kind}`}>{file.kind}</span>
            </button>
          </div>
        ))}
      </div>
      <CommitPanel />
    </div>
  );
}
