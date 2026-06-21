import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type MonacoEnvironment = {
  getWorker: (_workerID: string, label: string) => Worker;
};

type MonacoGlobal = typeof globalThis & {
  monaco?: typeof monaco;
  MonacoEnvironment: MonacoEnvironment;
};

(globalThis as MonacoGlobal).monaco = monaco;
(globalThis as MonacoGlobal).MonacoEnvironment = {
  getWorker(_workerID, label) {
    if (label === "json") {
      return new JsonWorker();
    }
    if (label === "javascript" || label === "typescript") {
      return new TypeScriptWorker();
    }
    return new EditorWorker();
  }
};

loader.config({ monaco });
