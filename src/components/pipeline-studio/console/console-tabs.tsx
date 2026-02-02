"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsTab } from "./logs-tab";
import { SpecTab } from "./spec-tab";
import { SelectedSqlTab } from "./selected-sql-tab";
import { SampleSqlTab } from "./sample-sql-tab";
import { ApiCallsTab } from "./api-calls-tab";
import { DataTab } from "./data-tab";

export function ConsoleTabs() {
  return (
    <Tabs defaultValue="logs" className="h-full w-full flex flex-col overflow-hidden min-w-0">
      <div className="border-b border-slate-200 bg-slate-50/50 px-2">
        <TabsList className="h-9 bg-transparent p-0 gap-2">
          <TabsTrigger
            value="data"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Data
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Logs
          </TabsTrigger>
          <TabsTrigger
            value="spec"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Pipeline Spec
          </TabsTrigger>
          <TabsTrigger
            value="selected-sql"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Selected SQL
          </TabsTrigger>
          <TabsTrigger
            value="sample-sql"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Sample SQL
          </TabsTrigger>
          <TabsTrigger
            value="api"
            className="px-3 py-1.5 h-7 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            API Calls
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="data" className="flex-1 m-0 overflow-hidden min-w-0 min-h-0">
        <DataTab />
      </TabsContent>
      <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
        <LogsTab />
      </TabsContent>
      <TabsContent value="spec" className="flex-1 m-0 overflow-hidden">
        <SpecTab />
      </TabsContent>
      <TabsContent value="selected-sql" className="flex-1 m-0 overflow-hidden">
        <SelectedSqlTab />
      </TabsContent>
      <TabsContent value="sample-sql" className="flex-1 m-0 overflow-hidden">
        <SampleSqlTab />
      </TabsContent>
      <TabsContent value="api" className="flex-1 m-0 overflow-hidden">
        <ApiCallsTab />
      </TabsContent>
    </Tabs>
  );
}
