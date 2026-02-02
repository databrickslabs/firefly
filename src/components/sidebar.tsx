"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isAdmin } from "@/lib/admin-utils";
import {
  Home,
  FileText,
  Clock,
  Database,
  Code,
  Briefcase,
  ShieldCheck,
  FileCode,
  NotebookPen,
} from "lucide-react";

interface SidebarProps {
  basePath: string;
  userEmail?: string | null;
}

const navigationItems = [
  {
    name: "Home",
    href: "/dashboard",
    icon: Home,
  },
  {
    name: "Notebooks",
    href: "/notebooks",
    icon: FileText,
  },
  {
    name: "Recents",
    href: "/recents",
    icon: Clock,
  },
  {
    name: "Catalog",
    href: "/catalog",
    icon: Database,
  },
  {
    name: "SQL",
    href: "/sql",
    icon: Code,
  },
  {
    name: "Code Editor",
    href: "/code-editor",
    icon: FileCode,
  },
  {
    name: "Notebook Editor",
    href: "/notebook-editor",
    icon: NotebookPen,
  },
  {
    name: "Jobs",
    href: "/jobs",
    icon: Briefcase,
  },
];

export function Sidebar({ basePath, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const showAdminLink = isAdmin(userEmail);

  return (
    <aside className="w-48 border-r bg-background flex flex-col">
      <nav className="flex-1 p-2 space-y-1">
        {navigationItems.map((item) => {
          const fullPath = `${basePath}${item.href}`;
          const isActive = pathname === fullPath;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={fullPath}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Link>
          );
        })}

        {/* Admin Link - Only visible to @databricks.com users */}
        {showAdminLink && (
          <>
            <div className="my-2 border-t"></div>
            <Link
              href={`/admin?returnUrl=${encodeURIComponent(pathname)}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                pathname === "/admin"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Admin</span>
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}
