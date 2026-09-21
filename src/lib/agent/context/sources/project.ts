import { CONTEXT_PRIORITIES, type ContextSlice, type ContextSource, type SourceCollectResult } from "../types";
import { estimateTokens } from "../tokens";
import { useProjectStore } from "../../../../stores/projectStore";
import { useAccountStore } from "../../../../stores/accountStore";
import { accountPromptContext } from "../../../account/AccountContext";

export class ProjectSource implements ContextSource {
  readonly id = "project" as const;

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    if (!snapshot.project) {
      return { slices: [], skipReason: "no project" };
    }

    const github = useProjectStore.getState().currentProject;
    const githubLabel = github?.githubOwner && github.githubRepo
      ? `\nGitHub: ${github.githubOwner}/${github.githubRepo}`
      : "";
    const accountLine = accountPromptContext(useAccountStore.getState().currentAccount);
    const projectText = `Project: ${snapshot.project.name}\nRoot: ${snapshot.project.rootPath}${githubLabel}${accountLine ? `\n${accountLine}` : ""}`;
    const slices: ContextSlice[] = [{
      id: "project:info",
      source: this.id,
      priority: CONTEXT_PRIORITIES.activeTask,
      score: 1,
      tokens: estimateTokens(projectText),
      text: projectText,
      meta: { name: snapshot.project.name, root: snapshot.project.rootPath },
    }];

    if (snapshot.activeTask) {
      const taskText = `Active task: ${snapshot.activeTask.title} (${snapshot.activeTask.status}, ${snapshot.activeTask.progress}%)`;
      slices.push({
        id: `project:task:${snapshot.activeTask.id}`,
        source: this.id,
        priority: CONTEXT_PRIORITIES.activeTask,
        score: 1,
        tokens: estimateTokens(taskText),
        text: taskText,
        meta: { taskId: snapshot.activeTask.id },
      });
    }

    return { slices };
  }
}
