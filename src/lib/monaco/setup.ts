import * as monaco from "monaco-editor";
import editorWorker from "../../workers/editor.worker?worker";
import jsonWorker from "../../workers/json.worker?worker";
import cssWorker from "../../workers/css.worker?worker";
import htmlWorker from "../../workers/html.worker?worker";
import tsWorker from "../../workers/ts.worker?worker";
import { loader } from "@monaco-editor/react";

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

export function configureMonaco(instance: typeof monaco) {
  instance.editor.defineTheme("kursor-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "667085", fontStyle: "italic" },
      { token: "keyword", foreground: "B8A9FF" },
      { token: "string", foreground: "A8D6A2" },
      { token: "number", foreground: "E7B878" },
      { token: "type.identifier", foreground: "6EC8E8" },
    ],
    colors: {
      "editor.background": "#0d1016",
      "editor.foreground": "#cdd2dc",
      "editorLineNumber.foreground": "#3f4757",
      "editorLineNumber.activeForeground": "#8a93a3",
      "editorCursor.foreground": "#a99fff",
      "editor.selectionBackground": "#40396b80",
      "editor.lineHighlightBackground": "#141923",
      "editorIndentGuide.background1": "#202634",
      "editorIndentGuide.activeBackground1": "#343c4e",
      "minimap.background": "#0d1016",
      "scrollbarSlider.background": "#29314380",
      "scrollbarSlider.hoverBackground": "#394359a0",
      "diffEditor.insertedTextBackground": "#39d98a33",
      "diffEditor.removedTextBackground": "#f0737f33",
      "diffEditor.insertedLineBackground": "#39d98a18",
      "diffEditor.removedLineBackground": "#f0737f18",
    },
  });

}
