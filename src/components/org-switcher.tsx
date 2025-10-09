"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
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
  const router = useRouter();
  // Use the built-in better-auth hook to list organizations
  const { data: organizations, isPending: loading } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: session } = useSession();

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

      // Sign out first to clear the current session completely
      await authClient.signOut();

      // Redirect to login page with the new organization
      // The login flow will set the active org after authentication
      router.push(`/databricks-idp/login?email=${encodeURIComponent(session.user.email)}&org=${orgId}`);
    } catch (error) {
      console.error("Error switching organization:", error);
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
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate">
            {activeOrg?.name || "Select Organization"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleOrgSwitch(org.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <div className="flex flex-col">
                <span className="font-medium">{org.name}</span>
                {org.slug && (
                  <span className="text-xs text-muted-foreground">
                    @{org.slug}
                  </span>
                )}
              </div>
            </div>
            {activeOrg?.id === org.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
