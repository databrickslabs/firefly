"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FolderOpen } from "lucide-react";
import { ImportWizard } from "@/components/import-data/import-wizard";
import { FileExplorer } from "@/components/import-data/file-explorer";

export default function ImportDataPage() {
  return (
    <div className="p-8 h-full">
      <div className="max-w-7xl h-full flex flex-col">
        {/* Header */}
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-bold">Import Data</h1>
          <p className="text-muted-foreground">
            Import files into Unity Catalog or manage your volume storage.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="import" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit">
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Import Data
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Manage Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="flex-1 mt-6 min-h-0">
            <div className="h-[calc(100vh-16rem)] border rounded-lg bg-background">
              <ImportWizard />
            </div>
          </TabsContent>

          <TabsContent value="files" className="flex-1 mt-6 min-h-0">
            <div className="h-[calc(100vh-16rem)]">
              <FileExplorer />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
