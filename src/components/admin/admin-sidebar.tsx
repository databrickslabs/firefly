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

// Allowed path prefixes for the returnUrl
const ALLOWED_PATH_PREFIXES = ["/databricks-idp/"];

// Sanitize and validate the return URL
function sanitizeReturnUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    // Decode the URL
    const decodedUrl = decodeURIComponent(url);

    // Must start with one of the allowed prefixes
    const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
      decodedUrl.startsWith(prefix)
    );

    if (!isAllowed) return null;

    // Ensure it's a relative path (no protocol or host)
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
  const [returnUrl] = useQueryState("returnUrl", parseAsString);

  // Sanitize the return URL
  const sanitizedReturnUrl = sanitizeReturnUrl(returnUrl);

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Admin Panel</h2>
        <p className="text-xs text-muted-foreground">Back Office Operations</p>
      </div>

      {/* Back to Workspace button */}
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
          // Preserve returnUrl query parameter when navigating between admin pages
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
