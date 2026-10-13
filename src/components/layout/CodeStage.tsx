import { Group, Panel, Separator } from "react-resizable-panels";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUiStore } from "../../stores/uiStore";
import { EditorWorkspace } from "../editor/EditorWorkspace";
import { ProjectExplorer } from "../explorer/ProjectExplorer";
import { TerminalPanel } from "../terminal/TerminalPanel";

export function CodeStage() {
  const terminalVisible = useTerminalStore((state) => state.visible);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  return (
    <div className="code-stage">
      {sidebarVisible && (
        <div className="code-explorer">
          <ProjectExplorer />
        </div>
      )}
      <div className="code-editor">
        {terminalVisible ? (
          <Group orientation="vertical">
            <Panel id="code-editor" defaultSize="70%" minSize="160px"><EditorWorkspace /></Panel>
            <Separator className="resize-handle vertical" />
            <Panel id="code-terminal" defaultSize="30%" minSize="100px" maxSize="55%"><TerminalPanel /></Panel>
          </Group>
        ) : <EditorWorkspace />}
      </div>
    </div>
  );
}
