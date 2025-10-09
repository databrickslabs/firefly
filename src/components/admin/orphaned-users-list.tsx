"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { UserX, Mail, Calendar, Building2, Shield, CheckCircle, AlertCircle } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

interface Organization {
  id: string;
  name: string;
  slug: string | null;
}

interface OrphanedUsersListProps {
  refresh?: number;
}

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function OrphanedUsersList({ refresh }: OrphanedUsersListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningUser, setAssigningUser] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Record<string, string>>({});
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({});
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch orphaned users
        const usersResponse = await fetch("/api/admin/orphaned-users");
        if (!usersResponse.ok) {
          throw new Error("Failed to fetch orphaned users");
        }
        const usersData = await usersResponse.json();

        // Fetch organizations
        const orgsResponse = await fetch("/api/admin/organizations");
        if (!orgsResponse.ok) {
          throw new Error("Failed to fetch organizations");
        }
        const orgsData = await orgsResponse.json();

        setUsers(usersData);
        setOrganizations(orgsData);

        // Initialize defaults
        const defaultOrg: Record<string, string> = {};
        const defaultRole: Record<string, string> = {};
        usersData.forEach((user: User) => {
          if (orgsData.length > 0) {
            defaultOrg[user.id] = orgsData[0].id;
          }
          defaultRole[user.id] = "member";
        });
        setSelectedOrg(defaultOrg);
        setSelectedRole(defaultRole);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [refresh]);

  const handleAssignUser = async (userId: string, userEmail: string) => {
    const orgId = selectedOrg[userId];
    const role = selectedRole[userId];

    if (!orgId) {
      setAssignError("Please select an organization");
      return;
    }

    setAssigningUser(userId);
    setAssignSuccess(null);
    setAssignError(null);

    try {
      // Invite user to organization
      await authClient.organization.inviteMember({
        email: userEmail,
        organizationId: orgId,
        role: role as "owner" | "admin" | "member",
      });

      setAssignSuccess(userId);

      // Remove user from orphaned list after 1 second
      setTimeout(() => {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setAssignSuccess(null);
      }, 1000);
    } catch (err) {
      console.error("Error assigning user:", err);
      setAssignError(err instanceof Error ? err.message : "Failed to assign user");
    } finally {
      setAssigningUser(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading orphaned users...</p>
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

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
      <div className="flex items-center gap-2 mb-6">
        <UserX className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        <h2 className="text-xl font-semibold">Orphaned Users</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? "user" : "users"} without organization
        </span>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600 dark:text-green-400" />
          <p className="font-medium">All users are assigned to organizations!</p>
          <p className="text-sm mt-1">No orphaned users found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {organizations.length === 0 && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-400 dark:border-yellow-800 rounded-md mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                No organizations available. Create an organization first to assign users.
              </p>
            </div>
          )}

          {users.map((user) => (
            <div
              key={user.id}
              className="p-4 border rounded-lg space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{user.name}</h3>
                    {user.emailVerified && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Mail className="h-3 w-3" />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {organizations.length > 0 && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Organization
                    </label>
                    <select
                      value={selectedOrg[user.id] || ""}
                      onChange={(e) =>
                        setSelectedOrg((prev) => ({
                          ...prev,
                          [user.id]: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} {org.slug ? `(@${org.slug})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Role
                    </label>
                    <select
                      value={selectedRole[user.id] || "member"}
                      onChange={(e) =>
                        setSelectedRole((prev) => ({
                          ...prev,
                          [user.id]: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleAssignUser(user.id, user.email)}
                    disabled={assigningUser === user.id}
                  >
                    {assigningUser === user.id ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              )}

              {assignSuccess === user.id && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span>User assigned successfully!</span>
                </div>
              )}

              {assignError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>{assignError}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
