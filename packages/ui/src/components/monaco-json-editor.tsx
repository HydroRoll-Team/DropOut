import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import { jsonDefaults } from "monaco-editor/languages/features/json/register";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

type MonacoEnvironment = {
  getWorker: (moduleId: string, label: string) => Worker;
};

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironment;
};

monacoGlobal.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};

monaco.editor.defineTheme("dropout-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "string.key.json", foreground: "A7F3D0" },
    { token: "string.value.json", foreground: "C4B5FD" },
    { token: "number", foreground: "FDE68A" },
  ],
  colors: {
    "editor.background": "#0A0A0C",
    "editor.foreground": "#E4E4E7",
    "editor.lineHighlightBackground": "#18181B",
    "editorLineNumber.foreground": "#52525B",
    "editorLineNumber.activeForeground": "#A1A1AA",
    "editor.selectionBackground": "#4F46E566",
    "editor.inactiveSelectionBackground": "#3F3F4666",
    "editorIndentGuide.background1": "#27272A",
    "editorIndentGuide.activeBackground1": "#52525B",
  },
});

monaco.editor.defineTheme("dropout-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "string.key.json", foreground: "047857" },
    { token: "string.value.json", foreground: "6D28D9" },
    { token: "number", foreground: "B45309" },
  ],
  colors: {
    "editor.background": "#FAFAFA",
    "editor.foreground": "#18181B",
    "editor.lineHighlightBackground": "#F4F4F5",
    "editorLineNumber.foreground": "#A1A1AA",
    "editorLineNumber.activeForeground": "#52525B",
    "editor.selectionBackground": "#6366F144",
    "editor.inactiveSelectionBackground": "#A1A1AA33",
    "editorIndentGuide.background1": "#E4E4E7",
    "editorIndentGuide.activeBackground1": "#A1A1AA",
  },
});

export interface MonacoJsonEditorHandle {
  focus: () => void;
  format: () => Promise<void>;
}

interface MonacoJsonEditorProps {
  ariaLabel: string;
  className?: string;
  dark: boolean;
  jsonSchema: Record<string, unknown>;
  onChange: (value: string) => void;
  onCursorChange?: (line: number, column: number) => void;
  onSave: () => void;
  value: string;
}

export const MonacoJsonEditor = forwardRef<
  MonacoJsonEditorHandle,
  MonacoJsonEditorProps
>(function MonacoJsonEditor(
  {
    ariaLabel,
    className,
    dark,
    jsonSchema,
    onChange,
    onCursorChange,
    onSave,
    value,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initialValue = useRef(value);
  const ariaLabelRef = useRef(ariaLabel);
  const darkRef = useRef(dark);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    ariaLabelRef.current = ariaLabel;
    editorRef.current?.updateOptions({ ariaLabel });
  }, [ariaLabel]);

  useEffect(() => {
    darkRef.current = dark;
    monaco.editor.setTheme(dark ? "dropout-dark" : "dropout-light");
  }, [dark]);

  useEffect(() => {
    jsonDefaults.setDiagnosticsOptions({
      allowComments: false,
      enableSchemaRequest: false,
      schemas: [
        {
          uri: "https://dropout.hydroroll.team/schemas/launcher-config.json",
          fileMatch: ["inmemory://dropout/launcher-config.json"],
          schema: jsonSchema,
        },
      ],
      trailingCommas: "error",
      validate: true,
    });
  }, [jsonSchema]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const modelUri = monaco.Uri.parse(
      "inmemory://dropout/launcher-config.json",
    );
    monaco.editor.getModel(modelUri)?.dispose();
    const model = monaco.editor.createModel(
      initialValue.current,
      "json",
      modelUri,
    );
    const editor = monaco.editor.create(container, {
      ariaLabel: ariaLabelRef.current,
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      folding: true,
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace',
      fontLigatures: true,
      fontSize: 13,
      formatOnPaste: true,
      formatOnType: true,
      guides: { bracketPairs: true, indentation: true },
      lineHeight: 21,
      minimap: { enabled: true, renderCharacters: false, scale: 1 },
      model,
      padding: { bottom: 12, top: 12 },
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      stickyScroll: { enabled: true },
      tabSize: 2,
      theme: darkRef.current ? "dropout-dark" : "dropout-light",
      wordWrap: "off",
    });
    editorRef.current = editor;

    const contentSubscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });
    const cursorSubscription = editor.onDidChangeCursorPosition(
      ({ position }) => {
        onCursorChangeRef.current?.(position.lineNumber, position.column);
      },
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });

    return () => {
      contentSubscription.dispose();
      cursorSubscription.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        editorRef.current?.focus();
      },
      async format() {
        await editorRef.current
          ?.getAction("editor.action.formatDocument")
          ?.run();
        editorRef.current?.focus();
      },
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      data-testid="monaco-config-editor"
      className={cn("min-h-0 min-w-0", className)}
    />
  );
});
