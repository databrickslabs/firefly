"use client";

import * as React from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

interface SQLEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
  catalogItems?: {
    catalogs: string[];
    schemas: Record<string, string[]>;
    tables: Record<string, Record<string, string[]>>;
    columns: Record<string, Array<{ name: string; type: string }>>;
  };
}

export function SQLEditorPanel({
  value,
  onChange,
  onRun,
  readOnly = false,
  catalogItems,
}: SQLEditorPanelProps) {
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register custom SQL autocomplete provider
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
          "SELECT",
          "FROM",
          "WHERE",
          "JOIN",
          "LEFT JOIN",
          "RIGHT JOIN",
          "INNER JOIN",
          "OUTER JOIN",
          "ON",
          "GROUP BY",
          "ORDER BY",
          "HAVING",
          "LIMIT",
          "OFFSET",
          "INSERT",
          "UPDATE",
          "DELETE",
          "CREATE",
          "DROP",
          "ALTER",
          "TABLE",
          "VIEW",
          "INDEX",
          "AS",
          "AND",
          "OR",
          "NOT",
          "IN",
          "BETWEEN",
          "LIKE",
          "IS NULL",
          "IS NOT NULL",
          "CASE",
          "WHEN",
          "THEN",
          "ELSE",
          "END",
          "DISTINCT",
          "COUNT",
          "SUM",
          "AVG",
          "MIN",
          "MAX",
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

    // Add keyboard shortcut for running query (Cmd+Enter or Ctrl+Enter)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun?.();
    });
  };

  return (
    <Editor
      height="100%"
      defaultLanguage="sql"
      value={value}
      onChange={(value) => onChange(value || "")}
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
      }}
    />
  );
}
