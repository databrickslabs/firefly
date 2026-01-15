"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, Cpu, Database } from "lucide-react";

interface SettingsNavProps {
  basePath: string;
}

const navItems = [
  {
    title: "Overview",
    href: "",
    icon: Building2,
    description: "Organization details and members",
  },
  {
    title: "Compute",
    href: "/compute",
    icon: Cpu,
    description: "Clusters and SQL warehouses",
  },
  {
    title: "Storage",
    href: "/storage",
    icon: Database,
    description: "Unity Catalog and volumes",
  },
];

export function SettingsNav({ basePath }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 w-64 shrink-0">
      <div className="px-3 py-2">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization
        </p>
      </div>
      <div className="flex flex-col gap-1 px-2">
        {navItems.map((item) => {
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
        })}
      </div>
    </nav>
  );
}
