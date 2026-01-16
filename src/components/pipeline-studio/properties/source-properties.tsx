"use client";

import { useMemo, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RequiredLabel } from "./required-label";
import { useCatalogs, useSchemas, useTables, useTableDetails } from "@/hooks/use-unity-catalog";
import type { PipelineNodeData, SourceSubtype } from "@/stores/pipeline-store";
import type { Column } from "@/hooks/use-unity-catalog";

interface SourcePropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function SourceProperties({ data, onUpdate }: SourcePropertiesProps) {
  const config = data.config as {
    catalog?: string;
    schema?: string;
    table?: string;
    volume?: string;
    path?: string;
    format?: string;
    source?: string;
    topic?: string;
    readMode?: "batch" | "streaming";
    columns?: Column[];
  };

  const subtype = data.subtype as SourceSubtype;

  // Fetch Unity Catalog data for table source
  const { data: catalogs, isLoading: catalogsLoading } = useCatalogs();
  const { data: schemas, isLoading: schemasLoading } = useSchemas(config.catalog);
  const { data: tables, isLoading: tablesLoading } = useTables(config.catalog, config.schema);

  // Fetch table details (columns) when table is selected
  const { data: tableDetails } = useTableDetails(
    config.catalog,
    config.schema,
    config.table
  );

  // Store columns in config when table details are fetched
  useEffect(() => {
    if (tableDetails?.columns && subtype === "table") {
      // Only update if columns have changed
      const currentColumns = config.columns;
      const newColumns = tableDetails.columns;
      const columnsChanged =
        !currentColumns ||
        currentColumns.length !== newColumns.length ||
        currentColumns.some((c, i) => c.name !== newColumns[i]?.name);

      if (columnsChanged) {
        onUpdate({ columns: newColumns });
      }
    }
  }, [tableDetails?.columns, subtype, config.columns, onUpdate]);

  // Convert to SearchableSelect options
  const catalogOptions = useMemo(
    () =>
      (catalogs ?? []).map((c) => ({
        value: c.name,
        label: c.name,
        description: c.comment,
      })),
    [catalogs]
  );

  const schemaOptions = useMemo(
    () =>
      (schemas ?? []).map((s) => ({
        value: s.name,
        label: s.name,
        description: s.comment,
      })),
    [schemas]
  );

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((t) => ({
        value: t.name,
        label: t.name,
        description: t.table_type ? `${t.table_type}${t.comment ? ` - ${t.comment}` : ""}` : t.comment,
      })),
    [tables]
  );

  // Handle catalog change - clear schema, table, and columns
  const handleCatalogChange = (value: string) => {
    onUpdate({ catalog: value, schema: undefined, table: undefined, columns: undefined });
  };

  // Handle schema change - clear table and columns
  const handleSchemaChange = (value: string) => {
    onUpdate({ schema: value, table: undefined, columns: undefined });
  };

  // Handle table change - columns will be fetched automatically by useEffect
  const handleTableChange = (value: string) => {
    onUpdate({ table: value, columns: undefined });
  };

  if (subtype === "table") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="catalog" required>Catalog</RequiredLabel>
          <SearchableSelect
            options={catalogOptions}
            value={config.catalog}
            onValueChange={handleCatalogChange}
            placeholder="Select catalog..."
            searchPlaceholder="Search catalogs..."
            emptyMessage="No catalogs found."
            isLoading={catalogsLoading}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="schema" required>Schema</RequiredLabel>
          <SearchableSelect
            options={schemaOptions}
            value={config.schema}
            onValueChange={handleSchemaChange}
            placeholder="Select schema..."
            searchPlaceholder="Search schemas..."
            emptyMessage={config.catalog ? "No schemas found." : "Select a catalog first."}
            isLoading={schemasLoading}
            disabled={!config.catalog}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="table" required>Table</RequiredLabel>
          <SearchableSelect
            options={tableOptions}
            value={config.table}
            onValueChange={handleTableChange}
            placeholder="Select table..."
            searchPlaceholder="Search tables..."
            emptyMessage={config.schema ? "No tables found." : "Select a schema first."}
            isLoading={tablesLoading}
            disabled={!config.catalog || !config.schema}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="readMode">Read Mode</Label>
          <Select
            value={config.readMode || "batch"}
            onValueChange={(value) => onUpdate({ readMode: value })}
          >
            <SelectTrigger id="readMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="batch">Batch</SelectItem>
              <SelectItem value="streaming">Streaming</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (subtype === "volume") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="catalog" required>Catalog</RequiredLabel>
          <SearchableSelect
            options={catalogOptions}
            value={config.catalog}
            onValueChange={(value) => onUpdate({ catalog: value, schema: undefined })}
            placeholder="Select catalog..."
            searchPlaceholder="Search catalogs..."
            emptyMessage="No catalogs found."
            isLoading={catalogsLoading}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="schema" required>Schema</RequiredLabel>
          <SearchableSelect
            options={schemaOptions}
            value={config.schema}
            onValueChange={(value) => onUpdate({ schema: value })}
            placeholder="Select schema..."
            searchPlaceholder="Search schemas..."
            emptyMessage={config.catalog ? "No schemas found." : "Select a catalog first."}
            isLoading={schemasLoading}
            disabled={!config.catalog}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="volume" required>Volume</RequiredLabel>
          <Input
            id="volume"
            placeholder="e.g., my_volume"
            value={config.volume || ""}
            onChange={(e) => onUpdate({ volume: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="path" required>File Path</RequiredLabel>
          <Input
            id="path"
            placeholder="e.g., /data/files/*.parquet"
            value={config.path || ""}
            onChange={(e) => onUpdate({ path: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="format">File Format</Label>
          <Select
            value={config.format || "parquet"}
            onValueChange={(value) => onUpdate({ format: value })}
          >
            <SelectTrigger id="format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="parquet">Parquet</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="avro">Avro</SelectItem>
              <SelectItem value="delta">Delta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (subtype === "stream") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="source" required>Stream Source</RequiredLabel>
          <Select
            value={config.source || ""}
            onValueChange={(value) => onUpdate({ source: value })}
          >
            <SelectTrigger id="source">
              <SelectValue placeholder="Select source type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kafka">Kafka</SelectItem>
              <SelectItem value="kinesis">Kinesis</SelectItem>
              <SelectItem value="eventhub">Event Hub</SelectItem>
              <SelectItem value="pubsub">Pub/Sub</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="topic" required>Topic / Path</RequiredLabel>
          <Input
            id="topic"
            placeholder="e.g., kafka-topic-name"
            value={config.topic || ""}
            onChange={(e) => onUpdate({ topic: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <Select
            value={config.format || "json"}
            onValueChange={(value) => onUpdate({ format: value })}
          >
            <SelectTrigger id="format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="avro">Avro</SelectItem>
              <SelectItem value="protobuf">Protobuf</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return null;
}
