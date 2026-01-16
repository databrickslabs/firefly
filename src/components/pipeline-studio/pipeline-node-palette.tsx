"use client";

import { useCallback, useState, useMemo } from "react";
import { Database, FileCode, Cpu, HardDrive, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDnD } from "./dnd-context";
import { getNodeDefinitionsByCategory, nodeDefinitions, type NodeDefinition } from "./nodes";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NodeCategory } from "@/stores/pipeline-store";

const categoryLabels: Record<NodeCategory, string> = {
  source: "Sources",
  transform: "Transforms",
  ai: "AI / ML",
  destination: "Destinations",
};

const categoryIcons: Record<NodeCategory, React.ReactNode> = {
  source: <Database className="h-4 w-4" />,
  transform: <FileCode className="h-4 w-4" />,
  ai: <Cpu className="h-4 w-4" />,
  destination: <HardDrive className="h-4 w-4" />,
};

const categoryColors: Record<NodeCategory, string> = {
  source: "text-blue-600",
  transform: "text-purple-600",
  ai: "text-amber-600",
  destination: "text-green-600",
};

interface PaletteItemProps {
  definition: NodeDefinition;
}

function PaletteItem({ definition }: PaletteItemProps) {
  const { setDragData } = useDnD();

  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      setDragData(definition.category, definition.subtype);
      event.dataTransfer.setData("application/reactflow", definition.subtype);
      event.dataTransfer.effectAllowed = "move";
    },
    [definition, setDragData]
  );

  const Icon = definition.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          draggable
          onDragStart={onDragStart}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-grab",
            "border border-slate-200 bg-white",
            "hover:border-slate-300 hover:bg-slate-50",
            "active:cursor-grabbing transition-colors"
          )}
        >
          <div className="flex-shrink-0 p-1 rounded bg-slate-100">
            <Icon className="h-3.5 w-3.5 text-slate-600" />
          </div>
          <span className="text-sm font-medium text-slate-900 truncate">
            {definition.label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <div className="max-w-[200px]">
          <p className="font-medium">{definition.label}</p>
          <p className="text-xs opacity-80">{definition.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface PaletteCategoryProps {
  category: NodeCategory;
  definitions: NodeDefinition[];
  defaultOpen?: boolean;
}

function PaletteCategory({
  category,
  definitions,
  defaultOpen = true,
}: PaletteCategoryProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-slate-50 rounded-md group">
        <div className={cn("flex items-center gap-2", categoryColors[category])}>
          {categoryIcons[category]}
          <span className="font-medium text-sm">{categoryLabels[category]}</span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-2 pb-2">
          {definitions.map((def) => (
            <PaletteItem
              key={`${def.category}-${def.subtype}`}
              definition={def}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PipelineNodePalette() {
  const [searchQuery, setSearchQuery] = useState("");
  const categories: NodeCategory[] = ["source", "transform", "ai", "destination"];

  // Filter definitions based on search query
  const filteredDefinitionsByCategory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return getNodeDefinitionsByCategory();
    }

    // Filter all definitions that match the query
    const filtered = nodeDefinitions.filter(
      (def) =>
        def.label.toLowerCase().includes(query) ||
        def.description.toLowerCase().includes(query) ||
        def.subtype.toLowerCase().includes(query)
    );

    // Group by category
    return filtered.reduce(
      (acc, def) => {
        if (!acc[def.category]) {
          acc[def.category] = [];
        }
        acc[def.category].push(def);
        return acc;
      },
      {} as Record<NodeCategory, NodeDefinition[]>
    );
  }, [searchQuery]);

  // Check if there are any results
  const hasResults = categories.some(
    (cat) => (filteredDefinitionsByCategory[cat]?.length ?? 0) > 0
  );

  return (
    <div className="h-full flex flex-col border-r border-slate-200 bg-slate-50/50 overflow-hidden">
      <div className="flex-shrink-0 px-3 py-3 border-b border-slate-200 bg-white space-y-2">
        <div>
          <h2 className="font-semibold text-sm text-slate-900">Components</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Drag to canvas to add
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {hasResults ? (
              categories.map((category) => {
                const definitions = filteredDefinitionsByCategory[category] || [];
                if (definitions.length === 0) return null;
                return (
                  <PaletteCategory
                    key={category}
                    category={category}
                    definitions={definitions}
                    defaultOpen={true}
                  />
                );
              })
            ) : (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-slate-500">No components found</p>
                <p className="text-xs text-slate-400 mt-1">
                  Try a different search term
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
