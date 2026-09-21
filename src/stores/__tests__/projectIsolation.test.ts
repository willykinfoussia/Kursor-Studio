import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../projectStore";
import { useSettingsStore } from "../settingsStore";

describe("project and settings overlay", () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: { id: "p1", accountId: "acc", name: "TodoApp", rootPath: "/a", localPath: "/a" },
      projectSettings: {},
    });
  });

  it("stores a project override without changing the global default", () => {
    const globalModel = useSettingsStore.getState().defaultModel;
    useProjectStore.getState().updateProjectSetting("defaultModel", "override/model");
    expect(useProjectStore.getState().projectSettings.defaultModel).toBe("override/model");
    expect(useSettingsStore.getState().defaultModel).toBe(globalModel);
  });

  it("does not create duplicate projects in memory when switching to the same id", () => {
    const project = { id: "p1", accountId: "acc", name: "TodoApp", rootPath: "/a", localPath: "/a" };
    useProjectStore.setState({ projects: [project], recentProjects: [project], currentProject: project });
    useProjectStore.setState({
      currentProject: project,
      recentProjects: [project, ...useProjectStore.getState().recentProjects.filter((item) => item.id !== project.id)].slice(0, 12),
    });
    expect(useProjectStore.getState().recentProjects.filter((item) => item.id === "p1")).toHaveLength(1);
  });
});
