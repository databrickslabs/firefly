"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/admin-utils";
import {
  Home,
  Database,
  Code,
  Briefcase,
  ShieldCheck,
  FileCode,
  LayoutDashboard,
  GitBranch,
  Upload,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
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
    name: "Embedded Dashboard",
    href: "/embedded-dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Pipelines",
    href: "/pipelines",
    icon: GitBranch,
  },
  {
    name: "Import Data",
    href: "/import-data",
    icon: Upload,
  },
  {
    name: "Jobs (Coming Soon)",
    href: null,
    icon: Briefcase,
    disabled: true,
  },
] as const;

export function AppSidebar({ basePath, userEmail }: AppSidebarProps) {
  const pathname = usePathname();
  const showAdminLink = isAdmin(userEmail);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isDisabled = "disabled" in item && item.disabled;

                if (isDisabled || !item.href) {
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        disabled
                        tooltip={item.name}
                        className="cursor-not-allowed opacity-50"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const fullPath = `${basePath}${item.href}`;
                const isActive = pathname === fullPath;

                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={fullPath}>
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Link - Only visible to @databricks.com users */}
        {showAdminLink && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/admin"}
                    tooltip="Admin"
                  >
                    <Link href={`/admin?returnUrl=${encodeURIComponent(pathname)}`}>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
