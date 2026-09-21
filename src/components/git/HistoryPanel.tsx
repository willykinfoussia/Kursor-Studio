import { useGitStore } from "../../stores/gitStore";
import { CommitList } from "./CommitList";

export function HistoryPanel() {
  const commits = useGitStore((state) => state.commits);
  return <CommitList commits={commits} />;
}
