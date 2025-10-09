"use client";

import * as React from "react";
import Editor, { OnMount, loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { OpenFile } from "@/lib/workspace-file-manager";

interface MonacoMultiFileEditorProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onContentChange: (path: string, content: string) => void;
  onSave?: (path: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
  catalogItems?: {
    catalogs: string[];
    schemas: Record<string, string[]>;
    tables: Record<string, Record<string, string[]>>;
    columns: Record<string, Array<{ name: string; type: string }>>;
  };
}

export function MonacoMultiFileEditor({
  openFiles,
  activeFilePath,
  onContentChange,
  onSave,
  onRun,
  readOnly = false,
  catalogItems,
}: MonacoMultiFileEditorProps) {
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<typeof Monaco | null>(null);
  const modelsRef = React.useRef<Map<string, Monaco.editor.ITextModel>>(new Map());

  // Use refs to always get the latest callbacks
  const onSaveRef = React.useRef(onSave);
  const onRunRef = React.useRef(onRun);
  const activeFilePathRef = React.useRef(activeFilePath);

  React.useEffect(() => {
    onSaveRef.current = onSave;
    onRunRef.current = onRun;
    activeFilePathRef.current = activeFilePath;
  });

  const activeFile = React.useMemo(() => {
    return openFiles.find((f) => f.path === activeFilePath);
  }, [openFiles, activeFilePath]);

  // Configure monaco-sql-languages on mount
  const handleEditorWillMount = React.useCallback((monaco: typeof Monaco) => {
    monacoRef.current = monaco;

    // Configure SQL language
    monaco.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: Monaco.languages.CompletionItem[] = [];

        // SQL Keywords
        const sqlKeywords = [
          "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
          "INNER JOIN", "OUTER JOIN", "ON", "GROUP BY", "ORDER BY",
          "HAVING", "LIMIT", "OFFSET", "INSERT", "UPDATE", "DELETE",
          "CREATE", "DROP", "ALTER", "TABLE", "VIEW", "INDEX", "AS",
          "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS NULL",
          "IS NOT NULL", "CASE", "WHEN", "THEN", "ELSE", "END",
          "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CAST",
          "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "WITH",
        ];

        sqlKeywords.forEach((keyword) => {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          });
        });

        // Add catalog items if provided
        if (catalogItems) {
          // Catalogs
          catalogItems.catalogs.forEach((catalog) => {
            suggestions.push({
              label: catalog,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: catalog,
              detail: "Catalog",
              range,
            });
          });

          // Detect if we're after a catalog name (catalog.)
          const catalogMatch = textUntilPosition.match(/(\w+)\.$/);
          if (catalogMatch) {
            const catalog = catalogMatch[1];
            const schemas = catalogItems.schemas[catalog] || [];
            schemas.forEach((schema) => {
              suggestions.push({
                label: schema,
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: schema,
                detail: `Schema in ${catalog}`,
                range,
              });
            });
          }

          // Detect if we're after catalog.schema (catalog.schema.)
          const schemaMatch = textUntilPosition.match(/(\w+)\.(\w+)\.$/);
          if (schemaMatch) {
            const catalog = schemaMatch[1];
            const schema = schemaMatch[2];
            const tables = catalogItems.tables[catalog]?.[schema] || [];
            tables.forEach((table) => {
              suggestions.push({
                label: table,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: table,
                detail: `Table in ${catalog}.${schema}`,
                range,
              });
            });
          }

          // Add columns from all known tables
          Object.entries(catalogItems.columns).forEach(([fullTableName, columns]) => {
            columns.forEach((column) => {
              suggestions.push({
                label: column.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: column.name,
                detail: `${column.type} - ${fullTableName}`,
                range,
              });
            });
          });
        }

        return { suggestions };
      },
    });
  }, [catalogItems]);

  const handleEditorDidMount: OnMount = React.useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Add keyboard shortcuts
      // Cmd/Ctrl + S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeFilePathRef.current && onSaveRef.current) {
          onSaveRef.current(activeFilePathRef.current);
        }
      });

      // Cmd/Ctrl + Enter to run
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (onRunRef.current) {
          onRunRef.current();
        }
      });
    },
    [] // No dependencies - we use refs to always get latest values
  );

  // Update editor model when active file changes
  React.useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    try {
      // Get or create model for this file
      let model = modelsRef.current.get(activeFile.path);

      if (!model) {
        // Create new model
        const uri = monaco.Uri.parse(activeFile.path);
        model = monaco.editor.getModel(uri) || monaco.editor.createModel(
          activeFile.content,
          "sql",
          uri
        );

        // Store model reference
        modelsRef.current.set(activeFile.path, model);

        // Listen for content changes
        model.onDidChangeContent(() => {
          const content = model!.getValue();
          onContentChange(activeFile.path, content);
        });
      }

      // Only set model if it's different from current model
      // This prevents disposing the editor's internal services
      const currentModel = editor.getModel();
      if (currentModel !== model) {
        // Null out the model first to avoid disposal issues
        editor.setModel(null);
        // Then set the new model
        editor.setModel(model);
      }

      // Update read-only state
      editor.updateOptions({ readOnly });
    } catch (err) {
      console.error("Error updating Monaco model:", err);
    }
  }, [activeFile, readOnly, onContentChange]);

  // Clean up models when files are closed
  React.useEffect(() => {
    const openPaths = new Set(openFiles.map((f) => f.path));

    // Dispose models that are no longer open
    modelsRef.current.forEach((model, path) => {
      if (!openPaths.has(path)) {
        model.dispose();
        modelsRef.current.delete(path);
      }
    });
  }, [openFiles]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      // Dispose all models
      modelsRef.current.forEach((model) => model.dispose());
      modelsRef.current.clear();
    };
  }, []);

  return (
    <div className="h-full relative">
      {!activeFile && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground bg-background">
          <div className="text-center">
            <p className="text-sm">No file selected</p>
            <p className="text-xs mt-1">Open a file from the file tree to start editing</p>
          </div>
        </div>
      )}
      <Editor
        key="monaco-editor" // Prevent unnecessary remounting
        height="100%"
        // Don't pass path prop to prevent @monaco-editor/react from managing models
        // We manage models manually in the useEffect
        language="sql"
        defaultValue=""
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          readOnly,
          wordWrap: "on",
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          parameterHints: {
            enabled: true,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: "on",
          tabCompletion: "on",
          wordBasedSuggestions: "off",
          // Save on focus lost
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  );
}
