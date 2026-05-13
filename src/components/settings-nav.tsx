"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, Cpu, Database, Cloud } from "lucide-react";

interface SettingsNavProps {
  basePath: string;
  isGuest?: boolean;
}

const settingsItems = [
  {
    title: "Overview",
    href: "",
    icon: Building2,
    description: "Organization details and members",
    guestVisible: true,
  },
  {
    title: "Compute",
    href: "/compute",
    icon: Cpu,
    description: "Clusters and SQL warehouses",
    guestVisible: true,
  },
  {
    title: "Storage",
    href: "/storage",
    icon: Database,
    description: "Unity Catalog and volumes",
    guestVisible: false,
  },
];

const databricksItems = [
  {
    title: "Bring My Own Data",
    href: "/bring-your-own-data",
    icon: Cloud,
    description: "SPNs, workspaces, and sharing",
    guestVisible: true,
  },
];

export function SettingsNav({ basePath, isGuest = false }: SettingsNavProps) {
  const pathname = usePathname();

  const renderNavItem = (item: typeof settingsItems[0], basePath: string) => {
    const href = `${basePath}${item.href}`;
    const isActive = item.href === ""
      ? pathname === basePath || pathname === `${basePath}/`
      : pathname === href || pathname?.startsWith(`${href}/`);

    return (
      <Link
        key={item.title}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className={cn(
          "h-4 w-4",
          isActive ? "text-emerald-600 dark:text-emerald-400" : ""
        )} />
        <div className="flex flex-col">
          <span className="font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground">
            {item.description}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1 w-64 shrink-0">
      {/* Settings Section */}
      <div className="px-3 py-2">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization
        </p>
      </div>
      <div className="flex flex-col gap-1 px-2">
        {settingsItems
          .filter((item) => !isGuest || item.guestVisible)
          .map((item) => renderNavItem(item, basePath))}
      </div>

      {/* Databricks Section */}
      <div className="flex flex-col gap-1 px-2">
        {databricksItems
          .filter((item) => !isGuest || item.guestVisible)
          .map((item) => renderNavItem(item, basePath))}
      </div>
    </nav>
  );
}
