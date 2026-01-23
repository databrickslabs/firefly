"use client";

import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbNavProps {
  path: string[];
  onNavigate: (index: number) => void;
}

export function BreadcrumbNav({ path, onNavigate }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        onClick={() => onNavigate(-1)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors",
          path.length === 0 ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        <Home className="h-4 w-4" />
        <span>Volumes</span>
      </button>

      {path.map((segment, index) => (
        <div key={index} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => onNavigate(index)}
            className={cn(
              "px-2 py-1 rounded hover:bg-muted transition-colors",
              index === path.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {segment}
          </button>
        </div>
      ))}
    </nav>
  );
}
