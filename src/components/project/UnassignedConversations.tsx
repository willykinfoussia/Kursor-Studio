import { useEffect, useState } from "react";
import { conversationRepository } from "../../lib/storage/conversationRepository";
import { useProjectStore } from "../../stores/projectStore";
import type { ConversationRecord } from "../../lib/storage/types";
import type { Project } from "../../types/project";

export function UnassignedConversations({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState<ConversationRecord[]>([]);
  const current = useProjectStore((state) => state.currentProject);

  useEffect(() => {
    void conversationRepository.list(null).then(setItems).catch(() => setItems([]));
  }, []);

  if (items.length === 0 || projects.length === 0) return null;

  const assign = async (conversation: ConversationRecord, projectId: string) => {
    await conversationRepository.upsert({ ...conversation, projectId });
    setItems((currentItems) => currentItems.filter((item) => item.id !== conversation.id));
  };

  return (
    <div className="welcome-error" style={{ marginTop: 16, textAlign: "left" }}>
      <strong>Unassigned conversations</strong>
      <p>These chats are not tied to a project. Assign them so they stay isolated.</p>
      {items.map((conversation) => (
        <div key={conversation.id} className="home-recent" style={{ marginTop: 8 }}>
          <strong>{conversation.title || "Untitled"}</strong>
          <div className="modal-actions" style={{ marginTop: 8 }}>
            {(current ? [current, ...projects.filter((project) => project.id !== current.id)] : projects).slice(0, 6).map((project) => (
              <button
                type="button"
                className="modal-btn"
                key={project.id}
                onClick={() => void assign(conversation, project.id)}
              >
                Assign to {project.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
