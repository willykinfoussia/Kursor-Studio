import { ShieldAlert } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { gitService } from "../../lib/git/GitService";

export function GitReviewPanel() {
  const reviewBase = useGitStore((state) => state.reviewBase);
  const setReviewBase = useGitStore((state) => state.setReviewBase);
  const branches = useGitStore((state) => state.branches);
  const analyze = useGitStore((state) => state.analyze);
  const reviewBusy = useGitStore((state) => state.reviewBusy);
  const streaming = useGitStore((state) => state.reviewStreaming);
  const review = useGitStore((state) => state.review);
  const applyFix = useGitStore((state) => state.applyFix);
  const createReviewTask = useGitStore((state) => state.createReviewTask);
  const selectFile = useGitStore((state) => state.selectFile);
  const files = gitService.files(useGitStore((state) => state.status));
  const local = branches.filter((branch) => branch.kind === "local");

  return (
    <div className="git-review">
      <div className="git-section-header">AI GIT REVIEW</div>
      <label className="git-review-label">Review changes against</label>
      <select value={reviewBase} onChange={(event) => setReviewBase(event.target.value)}>
        {local.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
        {!local.some((branch) => branch.name === reviewBase) && <option value={reviewBase}>{reviewBase}</option>}
      </select>
      <button type="button" className="primary-btn" disabled={reviewBusy} onClick={() => void analyze()}>
        {reviewBusy ? "Analyzing…" : "Analyze Changes"}
      </button>
      <div className="git-review-scope">{files.length} files in the working tree</div>
      {review && (
        <div className={`git-risk git-risk-${review.risk}`}>
          <ShieldAlert size={14} /> Risk {review.risk}
        </div>
      )}
      <div className="git-review-body">
        {review ? (
          <>
            <p>{review.summary}</p>
            {review.findings.map((finding, index) => (
              <article className="git-finding" key={`${finding.title}-${index}`}>
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
                {finding.file && <div className="git-finding-file">{finding.file}</div>}
                <div className="git-finding-actions">
                  <button type="button" className="text-link" onClick={() => void applyFix(finding)}>Apply Fix</button>
                  {finding.file && <button type="button" className="text-link" onClick={() => void selectFile(finding.file!)}>Open Diff</button>}
                  <button type="button" className="text-link" onClick={() => void createReviewTask(finding)}>Create Task</button>
                </div>
              </article>
            ))}
            {review.findings.length === 0 && <div className="git-empty">No issues found.</div>}
          </>
        ) : (
          <pre className="git-review-stream">{streaming || "Run an analysis to review bugs, regressions, performance, security, and architecture."}</pre>
        )}
      </div>
    </div>
  );
}
