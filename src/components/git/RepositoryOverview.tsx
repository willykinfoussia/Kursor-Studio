import { githubService } from "../../lib/github/GitHubService";
import { openExternalUrl } from "../../lib/tauri/openUrl";
import { relativeTime } from "../../lib/git/format";
import { detectGitHost } from "../../lib/git/providers";
import { useAccountStore } from "../../stores/accountStore";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { ensureGitHubRepository } from "../../lib/github/ensureRepository";

export function RepositoryOverview() {
  const project = useProjectStore((state) => state.currentProject);
  const status = useGitStore((state) => state.status);
  const remotes = useGitStore((state) => state.remotes);
  const branches = useGitStore((state) => state.branches);
  const lastFetchAt = useGitStore((state) => state.lastFetchAt);
  const commits = useGitStore((state) => state.commits);
  const pulls = useGitStore((state) => state.pulls);
  const issues = useGitStore((state) => state.issues);
  const releases = useGitStore((state) => state.releases);
  const reviews = useGitStore((state) => state.recentReviews);
  const createPullRequest = useGitStore((state) => state.createPullRequest);
  const checkout = useGitStore((state) => state.checkout);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const remote = remotes[0];
  const host = detectGitHost(remote?.url);
  const owner = project?.githubOwner;
  const repo = project?.githubRepo;
  const contributors = [...new Map(commits.map((commit) => [commit.email || commit.author, commit.author])).values()].slice(0, 8);
  const githubUrl = owner && repo ? `https://github.com/${owner}/${repo}` : remote?.url;

  return (
    <div className="git-overview">
      <section className="git-overview-hero">
        <div>
          <h2>{project?.name ?? "Repository"}</h2>
          <div className="git-overview-sub">
            {status?.branch ?? "No branch"} · {host?.label ?? "Local git"}
            {lastFetchAt ? ` · fetched ${relativeTime(lastFetchAt)}` : " · not fetched yet"}
          </div>
        </div>
        <div className="git-overview-counts">
          <span>↑ {status?.ahead ?? 0} ahead</span>
          <span>↓ {status?.behind ?? 0} behind</span>
          <span>{pulls.length} open PRs</span>
          <span>{issues.length} issues</span>
        </div>
      </section>
      <div className="git-overview-grid">
        <section>
          <div className="git-section-header">GITHUB</div>
          {!githubConnected && (
            <button type="button" className="primary-btn" onClick={() => void signInGitHub()}>Connect GitHub</button>
          )}
          {githubConnected && !owner && project && (
            <button type="button" className="primary-btn" onClick={() => void ensureGitHubRepository(project, { promptSignIn: true })}>Create GitHub repository</button>
          )}
          {githubUrl && (
            <div className="git-overview-actions">
              <button type="button" className="settings-action" onClick={() => void openExternalUrl(githubUrl)}>Open GitHub</button>
              <button type="button" className="settings-action" onClick={() => void navigator.clipboard.writeText(githubUrl)}>Copy URL</button>
              <button type="button" className="settings-action" onClick={() => void createPullRequest()}>Create Pull Request</button>
              {owner && repo && (
                <button type="button" className="settings-action" onClick={() => void githubService.listPulls(owner, repo).then(() => openExternalUrl(`${githubUrl}/pulls`))}>
                  View Pull Requests
                </button>
              )}
            </div>
          )}
          <ul className="github-list">
            {pulls.slice(0, 6).map((item) => (
              <li key={item.id}>
                <span>#{item.number} {item.title}</span>
                <button type="button" className="text-link" onClick={() => void openExternalUrl(item.htmlUrl)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="git-section-header">RECENT BRANCHES</div>
          {branches.filter((branch) => branch.kind === "local").slice(0, 8).map((branch) => (
            <button type="button" className="git-overview-branch" key={branch.name} onClick={() => void checkout(branch.name)}>
              {branch.name}{branch.current ? " · HEAD" : ""}
            </button>
          ))}
        </section>
        <section>
          <div className="git-section-header">LATEST COMMITS</div>
          {commits.slice(0, 8).map((commit) => (
            <div className="git-overview-commit" key={commit.sha}>
              <strong>{commit.subject}</strong>
              <span>{commit.author} · {relativeTime(commit.timestamp)}</span>
            </div>
          ))}
        </section>
        <section>
          <div className="git-section-header">CONTRIBUTORS</div>
          <div className="git-contributors">{contributors.join(" · ") || "No commit authors yet."}</div>
        </section>
        <section>
          <div className="git-section-header">RECENT AI REVIEWS</div>
          {reviews.length === 0 && <div className="git-empty">No reviews yet.</div>}
          {reviews.map((item) => (
            <div className="git-overview-commit" key={item.at}>
              <strong>{item.result.risk} · {item.base}</strong>
              <span>{item.result.summary}</span>
            </div>
          ))}
        </section>
        <section>
          <div className="git-section-header">RELEASES</div>
          {releases.slice(0, 4).map((item) => (
            <div className="git-overview-commit" key={item.tagName}>
              <strong>{item.name || item.tagName}</strong>
              <button type="button" className="text-link" onClick={() => void openExternalUrl(item.htmlUrl)}>Open</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
