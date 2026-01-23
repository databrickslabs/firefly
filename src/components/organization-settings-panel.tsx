"use client";

import { useEffect, useState } from "react";
import { useSession, authClient } from "@/lib/auth-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Building2, Users, Shield, Globe } from "lucide-react";
import { UserSpnDetailsDialog } from "@/components/user-spn-details-dialog";
import { TeamMembersTable } from "@/components/team-members-table";

interface OrganizationSettingsPanelProps {
  orgId: string;
  accentColor?: "emerald" | "purple";
  apiEndpoints?: {
    orgUsers?: string;
    updateRole?: string;
    userSpnDetails?: string;
  };
  showSpnDetails?: boolean;
}

const DEFAULT_ENDPOINTS = {
  orgUsers: "/api/databricks/workspace/organization-users",
  updateRole: "/api/sso-spn/update-member-role",
  userSpnDetails: "/api/sso-spn/user-spn-details",
};

export function OrganizationSettingsPanel({
  orgId,
  accentColor = "emerald",
  apiEndpoints,
  showSpnDetails = true,
}: OrganizationSettingsPanelProps) {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: activeOrg, isPending: orgPending } = authClient.useActiveOrganization();
  const queryClient = useQueryClient();

  const endpoints = {
    ...DEFAULT_ENDPOINTS,
    ...apiEndpoints,
  };

  // Color classes based on accent color
  const colorClasses = {
    icon: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
    spinner: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
    workspaceUrl: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
    avatar: accentColor === "emerald" ? "bg-emerald-600" : "bg-purple-600",
    highlight: accentColor === "emerald" ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-purple-50 dark:bg-purple-950/20",
  };

  // Fetch current user's membership role using better-auth
  const [memberRole, setMemberRole] = useState<string | null>(null);

  // State for user details dialog
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string | null } | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);

  const handleUserClick = (userId: string, userName: string | null) => {
    setSelectedUser({ id: userId, name: userName });
    setIsUserDialogOpen(true);
  };

  useEffect(() => {
    const fetchMemberRole = async () => {
      try {
        const result = await authClient.organization.getActiveMember();
        if (result.data?.role) {
          setMemberRole(result.data.role);
        }
      } catch {
        // Silently fail
      }
    };
    fetchMemberRole();
  }, []);

  // Fetch organization users
  const { data: orgUsersData, isPending: usersLoading } = useQuery({
    queryKey: ["org-users", orgId],
    queryFn: async () => {
      const response = await fetch(endpoints.orgUsers);
      if (!response.ok) {
        throw new Error("Failed to fetch organization users");
      }
      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Mutation for updating member role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ targetUserId, newRole }: { targetUserId: string; newRole: string }) => {
      const response = await fetch(endpoints.updateRole, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, newRole }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users", orgId] });
    },
  });

  const isPending = sessionPending || orgPending;

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className={`w-8 h-8 ${colorClasses.spinner}`} />
      </div>
    );
  }

  const orgUsers = orgUsersData?.users || [];

  const handleRoleChange = (targetUserId: string, newRole: string) => {
    updateRoleMutation.mutate({ targetUserId, newRole });
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "admin":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // Combine current user and other users into a single array for the table
  const allMembers = [
    // Current user first
    ...(session?.user
      ? [
          {
            id: session.user.id,
            name: session.user.name || null,
            email: session.user.email || "",
            role: memberRole || "member",
            isCurrentUser: true,
          },
        ]
      : []),
    // Other users
    ...orgUsers.map((user: { id: string; name: string; email: string; role: string }) => ({
      id: user.id,
      name: user.name || null,
      email: user.email,
      role: user.role,
      isCurrentUser: false,
    })),
  ];

  return (
    <div className="p-8">
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-muted-foreground">
            Organization details and team members.
          </p>
        </div>

        {/* Organization Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className={`h-5 w-5 ${colorClasses.icon}`} />
              Organization Details
            </CardTitle>
            <CardDescription>
              Basic information about your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p className="text-lg font-semibold">{activeOrg?.name || "N/A"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Slug</p>
                <p className="text-lg font-mono">{activeOrg?.slug || "N/A"}</p>
              </div>
              {(activeOrg as { workspaceUrl?: string })?.workspaceUrl && (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Workspace URL
                  </p>
                  <p className={`text-lg font-mono ${colorClasses.workspaceUrl}`}>
                    {(activeOrg as { workspaceUrl?: string }).workspaceUrl}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Your Role */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className={`h-5 w-5 ${colorClasses.icon}`} />
              Your Role
            </CardTitle>
            <CardDescription>
              Your permissions in this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getRoleBadgeClass(memberRole || "")}`}>
                {memberRole ? memberRole.charAt(0).toUpperCase() + memberRole.slice(1) : "Unknown"}
              </span>
              <span className="text-sm text-muted-foreground">
                {memberRole === "owner"
                  ? "Full access to all organization settings"
                  : memberRole === "admin"
                  ? "Can manage organization settings and members"
                  : "Limited access"
                }
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className={`h-5 w-5 ${colorClasses.icon}`} />
              Team Members
            </CardTitle>
            <CardDescription>
              Members of this organization ({allMembers.length} total)
              {(memberRole === "owner" || memberRole === "admin") && " - Click on a user to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex items-center justify-center p-8">
                <Spinner className={`w-8 h-8 ${colorClasses.spinner}`} />
              </div>
            ) : (
              <>
                <TeamMembersTable
                  members={allMembers}
                  currentUserRole={memberRole}
                  onUserClick={handleUserClick}
                  onRoleChange={handleRoleChange}
                  isUpdatingRole={updateRoleMutation.isPending}
                  updatingUserId={updateRoleMutation.variables?.targetUserId}
                  accentColor={accentColor}
                />
                {updateRoleMutation.isError && (
                  <p className="text-sm text-red-600 text-center py-2 mt-4">
                    Error: {updateRoleMutation.error.message}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User SPN Details Dialog */}
      {showSpnDetails && (
        <UserSpnDetailsDialog
          open={isUserDialogOpen}
          onOpenChange={setIsUserDialogOpen}
          userId={selectedUser?.id || null}
          userName={selectedUser?.name || null}
          apiEndpoint={endpoints.userSpnDetails}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}
