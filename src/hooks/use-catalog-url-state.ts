"use client";

import * as React from "react";
import { useQueryStates, parseAsString } from "nuqs";
import type { SelectedItem } from "@/components/unity-catalog/catalog-tree-view";

export function useCatalogUrlState() {
  const [urlState, setUrlState] = useQueryStates(
    {
      catalog: parseAsString.withDefault(""),
      schema: parseAsString.withDefault(""),
      table: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: true }
  );

  const selectedItem: SelectedItem | null = React.useMemo(() => {
    if (urlState.table && urlState.schema && urlState.catalog) {
      return {
        type: "table",
        catalog: urlState.catalog,
        schema: urlState.schema,
        table: urlState.table,
      };
    }
    if (urlState.schema && urlState.catalog) {
      return {
        type: "schema",
        catalog: urlState.catalog,
        schema: urlState.schema,
      };
    }
    if (urlState.catalog) {
      return { type: "catalog", catalog: urlState.catalog };
    }
    return null;
  }, [urlState.catalog, urlState.schema, urlState.table]);

  const handleItemSelect = React.useCallback(
    (item: SelectedItem) => {
      switch (item.type) {
        case "catalog":
          setUrlState({ catalog: item.catalog, schema: "", table: "" });
          break;
        case "schema":
          setUrlState({
            catalog: item.catalog,
            schema: item.schema,
            table: "",
          });
          break;
        case "table":
          setUrlState({
            catalog: item.catalog,
            schema: item.schema,
            table: item.table,
          });
          break;
      }
    },
    [setUrlState]
  );

  const expandedNodes = React.useMemo(() => {
    const nodes = new Set<string>();
    if (urlState.catalog) {
      nodes.add(`catalog:${urlState.catalog}`);
    }
    if (urlState.catalog && urlState.schema) {
      nodes.add(`schema:${urlState.catalog}.${urlState.schema}`);
    }
    return nodes;
  }, [urlState.catalog, urlState.schema]);

  const selectedItemKey = React.useMemo(() => {
    if (!selectedItem) return null;
    switch (selectedItem.type) {
      case "catalog":
        return `catalog:${selectedItem.catalog}`;
      case "schema":
        return `schema:${selectedItem.catalog}.${selectedItem.schema}`;
      case "table":
        return `table:${selectedItem.catalog}.${selectedItem.schema}.${selectedItem.table}`;
    }
  }, [selectedItem]);

  return { selectedItem, handleItemSelect, expandedNodes, selectedItemKey };
}
