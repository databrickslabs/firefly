"use client";

import * as React from "react";
import Editor, { OnMount, loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { OpenFile } from "@/lib/workspace-file-manager";
import {
  detectSqlContext,
  extractTableAliases,
  extractTableReferences,
  getTableBeforeDot,
  resolveAlias,
  createKeywordCompletions,
  createFunctionCompletions,
  createCatalogCompletions,
  createSchemaCompletions,
  createTableCompletions,
  createColumnCompletions,
} from "@/lib/sql-autocomplete";
import { getCatalogCache } from "@/lib/catalog-metadata-cache";

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

  // Use a ref to store catalogItems so completion provider always has latest value
  const catalogItemsRef = React.useRef(catalogItems);

  // Get catalog cache for preloading
  const catalogCache = React.useMemo(() => getCatalogCache(), []);

  // Use refs to always get the latest callbacks
  const onSaveRef = React.useRef(onSave);
  const onRunRef = React.useRef(onRun);
  const activeFilePathRef = React.useRef(activeFilePath);

  React.useEffect(() => {
    onSaveRef.current = onSave;
    onRunRef.current = onRun;
    activeFilePathRef.current = activeFilePath;
  });

  // Keep catalogItemsRef updated
  React.useEffect(() => {
    catalogItemsRef.current = catalogItems;
  }, [catalogItems]);

  const activeFile = React.useMemo(() => {
    return openFiles.find((f) => f.path === activeFilePath);
  }, [openFiles, activeFilePath]);

  // Configure intelligent SQL autocomplete
  const handleEditorWillMount = React.useCallback((monaco: typeof Monaco) => {
    monacoRef.current = monaco;

    // Register intelligent SQL completion provider
    monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [".", " "], // Trigger on dot and space
      provideCompletionItems: async (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const fullQuery = model.getValue();
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: Monaco.languages.CompletionItem[] = [];

        // Get current catalogItems from ref (always up-to-date)
        const currentCatalogItems = catalogItemsRef.current;

        // Detect SQL context
        const context = detectSqlContext(textUntilPosition);
        const aliases = extractTableAliases(fullQuery);

        // Handle table.column completion (e.g., users. or u.)
        if (context === "TABLE_COLUMN") {
          const tableOrAlias = getTableBeforeDot(textUntilPosition);
          if (tableOrAlias && currentCatalogItems) {
            const fullTableName = resolveAlias(tableOrAlias, aliases);
            const columns = currentCatalogItems.columns[fullTableName] || [];

            suggestions.push(
              ...createColumnCompletions(monaco, columns, fullTableName, range)
            );
          }
          // Always add keywords even in TABLE_COLUMN context
          suggestions.push(...createKeywordCompletions(monaco, range));
          return { suggestions };
        }

        // Handle catalog.schema.table completion
        if (currentCatalogItems) {
          // After catalog.schema. → suggest tables (check this FIRST - more specific)
          const schemaMatch = textUntilPosition.match(/\b(\w+)\.(\w+)\.\s*\w*$/);
          if (schemaMatch) {
            const catalog = schemaMatch[1];
            const schema = schemaMatch[2];

            // Trigger preload of tables in the background
            const cached = catalogCache.getTables(catalog, schema);
            if (!cached) {
              // Check if we have this schema in our catalogs
              const hasSchema = currentCatalogItems.schemas[catalog]?.includes(schema);
              if (hasSchema) {
                // Preload tables in background
                fetch(`/api/databricks/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`)
                  .then(res => res.json())
                  .then(data => {
                    const tables = data.tables?.map((t: { name: string }) => t.name) || [];
                    catalogCache.setTables(catalog, schema, tables);
                  })
                  .catch(err => console.error('Failed to preload tables:', err));
              }
            }

            const tables = currentCatalogItems.tables[catalog]?.[schema] || cached || [];
            suggestions.push(
              ...createTableCompletions(monaco, tables, `${catalog}.${schema}`, range)
            );
            // Add keywords here too
            suggestions.push(...createKeywordCompletions(monaco, range));
            return { suggestions };
          }

          // After catalog. → suggest schemas (check this SECOND - less specific)
          const catalogMatch = textUntilPosition.match(/\b(\w+)\.\s*\w*$/);
          if (catalogMatch) {
            const catalog = catalogMatch[1];

            // Trigger preload of schemas in the background
            const cached = catalogCache.getSchemas(catalog);
            if (!cached && currentCatalogItems.catalogs.includes(catalog)) {
              // Preload schemas in background
              fetch(`/api/databricks/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`)
                .then(res => res.json())
                .then(data => {
                  const schemas = data.schemas?.map((s: { name: string }) => s.name) || [];
                  catalogCache.setSchemas(catalog, schemas);
                })
                .catch(err => console.error('Failed to preload schemas:', err));
            }

            const schemas = currentCatalogItems.schemas[catalog] || cached || [];
            suggestions.push(
              ...createSchemaCompletions(monaco, schemas, catalog, range)
            );
            // Add keywords here too
            suggestions.push(...createKeywordCompletions(monaco, range));
            return { suggestions };
          }
        }

        // Context-aware suggestions
        switch (context) {
          case "SELECT":
          case "WHERE":
          case "HAVING":
          case "ORDER_BY":
          case "GROUP_BY": {
            // Suggest columns from tables in the query
            if (currentCatalogItems) {
              const tableRefs = extractTableReferences(fullQuery);
              tableRefs.forEach(tableRef => {
                const fullTableName = resolveAlias(tableRef, aliases);
                const columns = currentCatalogItems.columns[fullTableName] || [];
                suggestions.push(
                  ...createColumnCompletions(monaco, columns, fullTableName, range)
                );
              });

              // Also suggest table.column format
              aliases.forEach(({ alias, fullTableName }) => {
                const columns = currentCatalogItems.columns[fullTableName] || [];
                columns.forEach(col => {
                  suggestions.push({
                    label: `${alias}.${col.name}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `${alias}.${col.name}`,
                    range,
                    detail: col.type,
                    sortText: "0" + alias + col.name,
                  });
                });
              });
            }

            // Add SQL functions for SELECT context
            if (context === "SELECT") {
              suggestions.push(...createFunctionCompletions(monaco, range));
            }
            break;
          }

          case "FROM":
          case "JOIN": {
            // Suggest tables and catalogs
            if (currentCatalogItems) {
              // Suggest catalogs
              suggestions.push(
                ...createCatalogCompletions(monaco, currentCatalogItems.catalogs, range)
              );

              // Suggest all known tables
              Object.entries(currentCatalogItems.tables).forEach(([catalog, schemas]) => {
                Object.entries(schemas).forEach(([schema, tables]) => {
                  const fullPath = `${catalog}.${schema}`;
                  tables.forEach(table => {
                    suggestions.push({
                      label: `${fullPath}.${table}`,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText: `${fullPath}.${table}`,
                      range,
                      detail: `Table in ${fullPath}`,
                      sortText: "1" + fullPath + table,
                    });
                  });
                });
              });
            }
            break;
          }

          default:
            // For unknown context, suggest everything
            if (currentCatalogItems) {
              suggestions.push(
                ...createCatalogCompletions(monaco, currentCatalogItems.catalogs, range)
              );
            }
            break;
        }

        // Always add keywords
        suggestions.push(...createKeywordCompletions(monaco, range));

        return { suggestions };
      },
    });
  }, []); // No dependencies - use ref to access latest catalogItems

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

      // Ctrl/Cmd + Space to trigger autocomplete
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
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
        theme="vs"
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
            snippetsPreventQuickSuggestions: false,
            filterGraceful: true,
            localityBonus: true,
          },
          quickSuggestions: {
            other: "on",
            comments: "off",
            strings: "off",
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
