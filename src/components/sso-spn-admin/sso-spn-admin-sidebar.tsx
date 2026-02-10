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
  ArrowLeft,
} from "lucide-react";
import { useQueryState, parseAsString } from "nuqs";
import { Button } from "@/components/ui/button";
import { GitHubSourceLink } from "@/components/github-source-link";

const ALLOWED_PATH_PREFIXES = ["/databricks-idp/", "/sso-spn/"];

function sanitizeReturnUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const decodedUrl = decodeURIComponent(url);

    const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
      decodedUrl.startsWith(prefix)
    );

    if (!isAllowed) return null;

    if (decodedUrl.includes("://") || decodedUrl.startsWith("//")) {
      return null;
    }

    return decodedUrl;
  } catch {
    return null;
  }
}

const navigationItems = [
  {
    name: "Overview",
    href: "/sso-spn-admin",
    icon: Home,
  },
  {
    name: "Organizations",
    href: "/sso-spn-admin/organizations",
    icon: Building2,
  },
  {
    name: "Users",
    href: "/sso-spn-admin/users",
    icon: Users,
  },
  {
    name: "Invite Users",
    href: "/sso-spn-admin/invite",
    icon: UserPlus,
  },
  {
    name: "Orphaned Users",
    href: "/sso-spn-admin/orphaned-users",
    icon: UserX,
  },
];

export function SsoSpnAdminSidebar() {
  const pathname = usePathname();
  const [returnUrl] = useQueryState("returnUrl", parseAsString);

  const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl);

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">SPN Admin Panel</h2>
          <GitHubSourceLink />
        </div>
        <p className="text-xs text-muted-foreground">Account-Level Operations</p>
      </div>

      {sanitizedReturnUrl && (
        <div className="p-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href={sanitizedReturnUrl}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Workspace</span>
            </Link>
          </Button>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const href = returnUrl
            ? `${item.href}?returnUrl=${encodeURIComponent(returnUrl)}`
            : item.href;

          return (
            <Link
              key={item.name}
              href={href}
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
