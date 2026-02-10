"use client";

import { CatalogTreeView } from "@/components/unity-catalog/catalog-tree-view";
import { CatalogViewer } from "@/components/unity-catalog/catalog-viewer";
import { Separator } from "@/components/ui/separator";
import { useCatalogUrlState } from "@/hooks/use-catalog-url-state";

export default function CatalogPage() {
  const { selectedItem, handleItemSelect, expandedNodes, selectedItemKey } =
    useCatalogUrlState();

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="p-6 pb-4">
        <h1 className="text-3xl font-bold">Unity Catalog</h1>
        <p className="text-muted-foreground mt-1">
          Browse catalogs, schemas, and tables in your Databricks workspace
        </p>
      </div>

      <Separator />

      {/* Two-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Tree View */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm">Catalog Explorer</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Click any item to view details
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <CatalogTreeView
              showColumns={false}
              viewMode="display"
              onItemSelect={handleItemSelect}
              controlledSelectedItemKey={selectedItemKey}
              controlledExpandedNodes={expandedNodes}
            />
          </div>
        </div>

        {/* Right Panel - Detail Viewer */}
        <div className="flex-1 overflow-hidden">
          <CatalogViewer selectedItem={selectedItem} className="h-full" />
        </div>
      </div>
    </div>
  );
}
