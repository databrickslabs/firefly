"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  UserPlus,
  UserX,
  Home,
  Users,
} from "lucide-react";

const navigationItems = [
  {
    name: "Overview",
    href: "/admin",
    icon: Home,
  },
  {
    name: "Organizations",
    href: "/admin/organizations",
    icon: Building2,
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Invite Users",
    href: "/admin/invite",
    icon: UserPlus,
  },
  {
    name: "Orphaned Users",
    href: "/admin/orphaned-users",
    icon: UserX,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Admin Panel</h2>
        <p className="text-xs text-muted-foreground">Back Office Operations</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
