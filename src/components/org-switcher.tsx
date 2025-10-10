"use client";

import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function OrgSwitcher() {
  // Use the built-in better-auth hook to list organizations
  const { data: organizations, isPending: loading } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: session } = useSession();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [switchingToOrgId, setSwitchingToOrgId] = useState<string | null>(null);

  const handleOrgSwitch = async (orgId: string) => {
    if (!session?.user?.email) {
      console.error("No user email found in session");
      return;
    }

    // Don't switch if already on this org
    if (activeOrg?.id === orgId) {
      console.log("Already on this organization");
      return;
    }

    try {
      console.log("Switching to organization:", orgId);
      setSwitching(true);
      setSwitchingToOrgId(orgId);

      // Try to switch using existing OAuth token
      const response = await fetch("/api/oauth/switch-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const data = await response.json();

      if (data.hasToken && data.success) {
        // Token exists, just reload the page to use the new active org
        console.log("Switched to organization using existing token");
        window.location.reload();
        return;
      }

      // No token found, need to authenticate
      console.log("No token found for org, redirecting to login");
      router.push(`/databricks-idp/login?email=${encodeURIComponent(session.user.email)}&org=${orgId}`);
    } catch (error) {
      console.error("Error switching organization:", error);
      setSwitching(false);
      setSwitchingToOrgId(null);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Building2 className="h-4 w-4 mr-2" />
        Loading...
      </Button>
    );
  }

  if (!organizations || organizations.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Building2 className="h-4 w-4 mr-2" />
        No Organizations
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2" disabled={switching}>
          {switching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          <span className="max-w-[150px] truncate">
            {switching ? "Switching..." : (activeOrg?.name || "Select Organization")}
          </span>
          {!switching && <ChevronsUpDown className="h-4 w-4 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleOrgSwitch(org.id)}
            disabled={switching}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {switchingToOrgId === org.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
              <div className="flex flex-col">
                <span className="font-medium">{org.name}</span>
                {org.slug && (
                  <span className="text-xs text-muted-foreground">
                    @{org.slug}
                  </span>
                )}
              </div>
            </div>
            {activeOrg?.id === org.id && !switching && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
