import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tauri/databaseApi", () => ({
  databaseApi: {
    conversationsUpsert: vi.fn(async () => undefined),
    conversationsList: vi.fn(async () => []),
    conversationsGet: vi.fn(async () => null),
    conversationsArchive: vi.fn(async () => undefined),
    messagesUpsert: vi.fn(async () => undefined),
    messagesList: vi.fn(async () => []),
    projectsUpsert: vi.fn(async (project) => project),
    projectsListRecent: vi.fn(async () => []),
    projectsGet: vi.fn(async () => null),
    projectsList: vi.fn(async () => []),
    projectsGetByPath: vi.fn(async () => null),
    projectsDelete: vi.fn(async () => undefined),
    settingsSet: vi.fn(async () => undefined),
    settingsList: vi.fn(async () => []),
  },
}));

import { databaseApi } from "../../tauri/databaseApi";
import { conversationRepository } from "../conversationRepository";
import { messageRepository } from "../messageRepository";
import { projectRepository } from "../projectRepository";
import { settingsRepository } from "../settingsRepository";

describe("storage repositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and lists conversations and messages", async () => {
    await conversationRepository.create({
      id: "c1",
      title: "Hello",
      createdAt: 1,
      updatedAt: 2,
      archived: 0,
    });
    await messageRepository.upsert({
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "Hi",
      createdAt: 1,
    });
    vi.mocked(databaseApi.conversationsList).mockResolvedValueOnce([
      { id: "c1", title: "Hello", createdAt: 1, updatedAt: 2, archived: 0 },
    ]);
    vi.mocked(databaseApi.messagesList).mockResolvedValueOnce([
      { id: "m1", conversationId: "c1", role: "user", content: "Hi", createdAt: 1 },
    ]);
    await expect(conversationRepository.list()).resolves.toHaveLength(1);
    await expect(messageRepository.list("c1")).resolves.toEqual([
      { id: "m1", conversationId: "c1", role: "user", content: "Hi", createdAt: 1 },
    ]);
    expect(databaseApi.conversationsUpsert).toHaveBeenCalled();
    expect(databaseApi.messagesUpsert).toHaveBeenCalled();
  });

  it("upserts and lists projects", async () => {
    const project = {
      id: "p1",
      name: "Todo",
      rootPath: "/tmp/todo",
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    };
    await projectRepository.upsert(project);
    vi.mocked(databaseApi.projectsListRecent).mockResolvedValueOnce([project]);
    await expect(projectRepository.listRecent()).resolves.toEqual([project]);
  });

  it("saves settings as JSON", async () => {
    await settingsRepository.set("fontSize", 14);
    expect(databaseApi.settingsSet).toHaveBeenCalledWith("fontSize", "14");
  });
});
