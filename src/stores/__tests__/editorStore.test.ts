import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.fn();
const writeFile = vi.fn();

vi.mock("../../lib/filesystem/FileSystemService", () => ({
  fileSystemService: {
    readFile: (...args: unknown[]) => readFile(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
    isBinaryPath: (path: string) => path.endsWith(".png"),
  },
  setProjectRootGetter: vi.fn(),
}));

import { useDialogStore } from "../dialogStore";
import { useEditorStore } from "../editorStore";

describe("editorStore", () => {
  beforeEach(() => {
    readFile.mockReset();
    writeFile.mockReset();
    useEditorStore.setState({
      tabs: [],
      activePath: null,
      closedTabs: [],
      opening: false,
      saving: false,
      status: null,
    });
    useDialogStore.setState({
      unsavedOpen: false,
      unsavedResolver: null,
      conflict: null,
    });
  });

  it("opens a file, marks it dirty, then saves", async () => {
    readFile.mockResolvedValue("export default function App() {}");
    writeFile.mockResolvedValue(undefined);
    await useEditorStore.getState().openFile("src/App.tsx");
    const opened = useEditorStore.getState();
    expect(opened.activePath).toBe("src/App.tsx");
    expect(opened.tabs[0]?.content).toContain("function App");
    expect(opened.tabs[0]?.isDirty).toBe(false);

    useEditorStore.getState().updateContent("src/App.tsx", "export default function App() { return null; }");
    expect(useEditorStore.getState().tabs[0]?.isDirty).toBe(true);

    await useEditorStore.getState().saveActive();
    expect(writeFile).toHaveBeenCalledWith("src/App.tsx", "export default function App() { return null; }");
    expect(useEditorStore.getState().tabs[0]?.isDirty).toBe(false);
  });

  it("reloads a clean tab on external change and conflicts when dirty", async () => {
    readFile.mockResolvedValueOnce("version-a").mockResolvedValueOnce("version-c");
    await useEditorStore.getState().openFile("src/Reloaded.tsx");
    await useEditorStore.getState().handleExternalChange("src/Reloaded.tsx");
    expect(useEditorStore.getState().tabs[0]?.content).toBe("version-c");

    useEditorStore.getState().updateContent("src/Reloaded.tsx", "version-b");
    await useEditorStore.getState().handleExternalChange("src/Reloaded.tsx");
    expect(useDialogStore.getState().conflict?.path).toBe("src/Reloaded.tsx");
    expect(useEditorStore.getState().tabs[0]?.content).toBe("version-b");
  });

  it("asks before closing a dirty tab and discards when requested", async () => {
    readFile.mockResolvedValue("hello");
    await useEditorStore.getState().openFile("src/App.tsx");
    useEditorStore.getState().updateContent("src/App.tsx", "changed");
    const closing = useEditorStore.getState().closeTab("src/App.tsx");
    useDialogStore.getState().resolveUnsaved("discard");
    await expect(closing).resolves.toBe(true);
    expect(useEditorStore.getState().tabs).toEqual([]);
  });

  it("cancels closing a dirty tab", async () => {
    readFile.mockResolvedValue("hello");
    await useEditorStore.getState().openFile("src/App.tsx");
    useEditorStore.getState().updateContent("src/App.tsx", "changed");
    const closing = useEditorStore.getState().closeTab("src/App.tsx");
    useDialogStore.getState().resolveUnsaved("cancel");
    await expect(closing).resolves.toBe(false);
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0]?.isDirty).toBe(true);
  });

  it("closes other tabs and keeps the requested one", async () => {
    readFile.mockResolvedValue("ok");
    await useEditorStore.getState().openFile("src/A.tsx");
    await useEditorStore.getState().openFile("src/B.tsx");
    await useEditorStore.getState().openFile("src/C.tsx");
    await expect(useEditorStore.getState().closeOthers("src/B.tsx")).resolves.toBe(true);
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(["src/B.tsx"]);
    expect(useEditorStore.getState().activePath).toBe("src/B.tsx");
  });

  it("stops closing others when a dirty tab is cancelled", async () => {
    readFile.mockResolvedValue("ok");
    await useEditorStore.getState().openFile("src/A.tsx");
    await useEditorStore.getState().openFile("src/B.tsx");
    useEditorStore.getState().updateContent("src/A.tsx", "changed");
    const closing = useEditorStore.getState().closeOthers("src/B.tsx");
    useDialogStore.getState().resolveUnsaved("cancel");
    await expect(closing).resolves.toBe(false);
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(["src/A.tsx", "src/B.tsx"]);
  });

  it("records closed tabs and reopens the last one", async () => {
    readFile.mockResolvedValue("ok");
    await useEditorStore.getState().openFile("src/A.tsx");
    await useEditorStore.getState().openFile("src/B.tsx");
    await expect(useEditorStore.getState().closeTab("src/B.tsx")).resolves.toBe(true);
    expect(useEditorStore.getState().closedTabs).toEqual(["src/B.tsx"]);
    await useEditorStore.getState().reopenClosedTab();
    expect(useEditorStore.getState().tabs.map((tab) => tab.path)).toEqual(["src/A.tsx", "src/B.tsx"]);
    expect(useEditorStore.getState().activePath).toBe("src/B.tsx");
    expect(useEditorStore.getState().closedTabs).toEqual([]);
  });

  it("cycles tabs with activateAdjacentTab", async () => {
    readFile.mockResolvedValue("ok");
    await useEditorStore.getState().openFile("src/A.tsx");
    await useEditorStore.getState().openFile("src/B.tsx");
    await useEditorStore.getState().openFile("src/C.tsx");
    useEditorStore.getState().activateAdjacentTab(-1);
    expect(useEditorStore.getState().activePath).toBe("src/B.tsx");
    useEditorStore.getState().activateAdjacentTab(1);
    expect(useEditorStore.getState().activePath).toBe("src/C.tsx");
  });
});
