"use client";

import { useEffect, useState } from "react";
import { Users, Building2, Shield, Mail } from "lucide-react";

interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date;
}

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  members?: Member[];
}

interface UserOrgListProps {
  refresh?: number;
}

export function UserOrgList({ refresh }: UserOrgListProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch all organizations via admin API
        const response = await fetch("/api/admin/organizations");

        if (!response.ok) {
          throw new Error("Failed to fetch organizations");
        }

        const data = await response.json();
        setOrganizations(data as Organization[]);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [refresh]);

  // Group members by userId to show users and their organizations
  const getUserOrgMap = () => {
    const userMap = new Map<string, {
      userId: string;
      organizations: Array<{
        orgId: string;
        orgName: string;
        orgSlug: string | null;
        role: string;
        joinedAt: Date;
      }>;
    }>();

    organizations.forEach((org) => {
      org.members?.forEach((member) => {
        if (!userMap.has(member.userId)) {
          userMap.set(member.userId, {
            userId: member.userId,
            organizations: [],
          });
        }

        userMap.get(member.userId)!.organizations.push({
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          role: member.role,
          joinedAt: member.createdAt,
        });
      });
    });

    return Array.from(userMap.values());
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "admin":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "member":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading user-organization relationships...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  const userOrgData = getUserOrgMap();

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">User-Organization Memberships</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {userOrgData.length} {userOrgData.length === 1 ? "user" : "users"}
        </span>
      </div>

      {userOrgData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No user memberships found</p>
          <p className="text-sm mt-1">Invite users to organizations to see them here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {userOrgData.map((userData) => (
            <div
              key={userData.userId}
              className="p-4 border rounded-lg"
            >
              <div className="flex items-start gap-3 mb-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">User ID: {userData.userId}</p>
                  <p className="text-sm text-muted-foreground">
                    Member of {userData.organizations.length} {userData.organizations.length === 1 ? "organization" : "organizations"}
                  </p>
                </div>
              </div>

              <div className="ml-8 space-y-2">
                {userData.organizations.map((membership) => (
                  <div
                    key={membership.orgId}
                    className="flex items-center gap-2 p-2 bg-muted/30 rounded"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">
                      {membership.orgName}
                      {membership.orgSlug && (
                        <span className="text-xs text-muted-foreground ml-1">
                          @{membership.orgSlug}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 ${getRoleBadgeColor(membership.role)}`}
                      >
                        <Shield className="h-3 w-3" />
                        {membership.role}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(membership.joinedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
