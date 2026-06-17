import MonacoEditor from "@monaco-editor/react";

type JavaScriptEditorProps = {
  canWrite: boolean;
  label: string;
  onChange: (script: string) => void;
  path: string;
  testID: string;
  value: string;
};

export function JavaScriptEditor({ canWrite, label, onChange, path, testID, value }: JavaScriptEditorProps) {
  return (
    <div className="javascript-editor-shell">
      <MonacoEditor
        className="javascript-editor"
        defaultLanguage="javascript"
        height="100%"
        language="javascript"
        loading={<span className="flow-empty">Loading editor</span>}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          ariaLabel: label,
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          readOnly: !canWrite,
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "on"
        }}
        path={path}
        theme="light"
        value={value}
        wrapperProps={{
          "aria-disabled": String(!canWrite),
          "aria-label": label,
          "data-testid": testID,
          role: "group"
        }}
        width="100%"
      />
    </div>
  );
}
