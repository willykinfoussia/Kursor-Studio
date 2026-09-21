import { useEffect } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { openProjectAt } from "../../lib/project/workspaceActions";
import { UnassignedConversations } from "./UnassignedConversations";

export function ManageProjectsPage() {
  const projects = useProjectStore((state) => state.projects);
  const current = useProjectStore((state) => state.currentProject);
  const removeProject = useProjectStore((state) => state.removeProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <main className="page">
      <header className="page-heading"><div><h1 className="page-title">Manage Projects</h1><div className="page-subtitle">Remove a project from Kursor without deleting local files.</div></div></header>
      <UnassignedConversations projects={projects} />
      <div className="home-recents">
        {projects.map((project) => (
          <div className="home-recent" key={project.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" className="home-recent" style={{ border: 0, flex: 1, textAlign: "left" }} onClick={() => void openProjectAt(project.rootPath)}>
              <strong>{project.name}{current?.id === project.id ? " · open" : ""}</strong>
              <span>{project.rootPath}</span>
            </button>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn"
                onClick={() => void removeProject(project.id)}
              >
                Remove from Kursor
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
