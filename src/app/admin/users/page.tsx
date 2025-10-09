"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Building2, Shield, Mail, Calendar } from "lucide-react";

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

interface UserOrgRelationship {
  userId: string;
  organizations: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string | null;
    role: string;
    joinedAt: Date;
  }>;
}

export default function UserManagementPage() {
  const [userOrgData, setUserOrgData] = useState<UserOrgRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/admin/organizations");

        if (!response.ok) {
          throw new Error("Failed to fetch organizations");
        }

        const data = await response.json();

        // Group members by userId
        const userMap = new Map<string, UserOrgRelationship>();

        data.forEach((org: Organization) => {
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

        setUserOrgData(Array.from(userMap.values()));
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading user memberships...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          User Management
        </h2>
        <p className="text-muted-foreground mt-1">
          View all user-organization memberships and roles
        </p>
      </div>

      {userOrgData.length === 0 ? (
        <div className="border rounded-lg bg-white dark:bg-slate-900 p-12 text-center">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-lg">No user memberships found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Invite users to organizations to see them here
          </p>
        </div>
      ) : (
        <div className="border rounded-lg bg-white dark:bg-slate-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Organizations</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>First Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userOrgData.map((userData) => {
                const firstOrg = userData.organizations[0];
                return (
                  <TableRow key={userData.userId}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {userData.userId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {userData.organizations.map((membership) => (
                          <div
                            key={membership.orgId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span>
                              {membership.orgName}
                              {membership.orgSlug && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  @{membership.orgSlug}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {userData.organizations.map((membership) => (
                          <div key={membership.orgId}>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(membership.role)}`}
                            >
                              <Shield className="h-3 w-3" />
                              {membership.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {new Date(firstOrg.joinedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {userOrgData.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Total: {userOrgData.length} {userOrgData.length === 1 ? "user" : "users"} with organization memberships
        </p>
      )}
    </div>
  );
}
