import { useEffect } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { isMissingProject } from "../../lib/project/ProjectService";
import { UnassignedConversations } from "./UnassignedConversations";
import { ProjectListItem } from "./ProjectListItem";

export function ManageProjectsPage() {
  const projects = useProjectStore((state) => state.projects);
  const current = useProjectStore((state) => state.currentProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const removeMissingProjects = useProjectStore((state) => state.removeMissingProjects);
  const missingCount = projects.filter(isMissingProject).length;

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <main className="page">
      <header className="page-heading">
        <div>
          <h1 className="page-title">Manage Projects</h1>
          <div className="page-subtitle">Remove a project from Kursor without deleting local files.</div>
        </div>
      </header>
      <UnassignedConversations projects={projects} />
      <div className="home-recents-heading">
        <h2 className="home-heading">Projects</h2>
        {missingCount > 0 && (
          <button type="button" className="home-missing-clear" onClick={() => void removeMissingProjects()}>
            Remove missing
          </button>
        )}
      </div>
      <div className="home-recents">
        {projects.map((project) => (
          <ProjectListItem
            key={project.id}
            project={project}
            current={current?.id === project.id}
            showRemoveWhenPresent
          />
        ))}
      </div>
    </main>
  );
}
