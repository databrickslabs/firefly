import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Types
interface Organization {
  id: string;
  name: string;
  slug: string | null;
  workspaceUrl: string | null;
  createdAt: Date;
  members?: Member[];
}

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user?: {
    email: string;
    name: string | null;
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

// Query Keys
export const adminKeys = {
  all: ["admin"] as const,
  organizations: () => [...adminKeys.all, "organizations"] as const,
  orphanedUsers: () => [...adminKeys.all, "orphaned-users"] as const,
  users: (query: string) => [...adminKeys.all, "users", query] as const,
};

// ============ QUERIES ============

export function useOrganizations() {
  return useQuery({
    queryKey: adminKeys.organizations(),
    queryFn: async (): Promise<Organization[]> => {
      const response = await fetch("/api/admin/organizations");
      if (!response.ok) throw new Error("Failed to fetch organizations");
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to ensure fresh data
  });
}

export function useOrphanedUsers() {
  return useQuery({
    queryKey: adminKeys.orphanedUsers(),
    queryFn: async (): Promise<User[]> => {
      const response = await fetch("/api/admin/orphaned-users");
      if (!response.ok) throw new Error("Failed to fetch orphaned users");
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to ensure fresh data
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: adminKeys.users(query),
    queryFn: async (): Promise<User[]> => {
      if (query.length < 2) return [];
      const response = await fetch(
        `/api/admin/search-users?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) throw new Error("Failed to search users");
      return response.json();
    },
    enabled: query.length >= 2,
  });
}

// ============ MUTATIONS ============

// Update Organization
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      organizationId: string;
      name: string;
      slug?: string;
      workspaceUrl?: string;
      ssoEnabled?: boolean;
    }) => {
      const response = await fetch("/api/admin/update-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update organization");
      return response.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });

      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );

      // Optimistically update
      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) =>
          old?.map((org) =>
            org.id === variables.organizationId
              ? {
                  ...org,
                  name: variables.name,
                  slug: variables.slug || null,
                  workspaceUrl: variables.workspaceUrl || null,
                }
              : org
          )
      );

      return { previousOrgs };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
    },
  });
}

// Create Organization
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug?: string;
      workspaceUrl?: string;
      ssoEnabled?: boolean;
    }) => {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create organization");
      return response.json();
    },
    onMutate: async (newOrg) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });

      // Snapshot previous value
      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );

      // Optimistically update with temporary ID
      const optimisticOrg: Organization = {
        id: `temp-${Date.now()}`,
        name: newOrg.name,
        slug: newOrg.slug || null,
        workspaceUrl: newOrg.workspaceUrl || null,
        createdAt: new Date(),
        members: [],
      };

      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) => (old ? [...old, optimisticOrg] : [optimisticOrg])
      );

      return { previousOrgs, optimisticOrg };
    },
    onError: (err, newOrg, context) => {
      // Rollback on error
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
    },
    onSuccess: (result, variables, context) => {
      // Replace optimistic org with real data
      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) =>
          old?.map((org) =>
            org.id === context?.optimisticOrg.id ? result : org
          )
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
    },
  });
}

// Add Member to Organization
export function useAddMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      organizationId: string;
      userId: string;
      role: string;
    }) => {
      const response = await fetch("/api/admin/add-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to add member");
      return response.json();
    },
    onMutate: async (newMember) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });
      await queryClient.cancelQueries({ queryKey: adminKeys.orphanedUsers() });

      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );
      const previousOrphaned = queryClient.getQueryData<User[]>(
        adminKeys.orphanedUsers()
      );

      // Optimistic update: add member to organization
      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) =>
          old?.map((org) =>
            org.id === newMember.organizationId
              ? {
                  ...org,
                  members: [
                    ...(org.members || []),
                    {
                      id: `temp-${Date.now()}`,
                      userId: newMember.userId,
                      role: newMember.role,
                      createdAt: new Date(),
                    },
                  ],
                }
              : org
          )
      );

      // Remove from orphaned users if present
      queryClient.setQueryData<User[]>(adminKeys.orphanedUsers(), (old) =>
        old?.filter((user) => user.id !== newMember.userId)
      );

      return { previousOrgs, previousOrphaned };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
      if (context?.previousOrphaned) {
        queryClient.setQueryData(
          adminKeys.orphanedUsers(),
          context.previousOrphaned
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
      queryClient.invalidateQueries({ queryKey: adminKeys.orphanedUsers() });
    },
  });
}

// Remove Member from Organization
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { memberId: string }) => {
      const response = await fetch("/api/admin/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to remove member");
      return response.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });
      await queryClient.cancelQueries({ queryKey: adminKeys.orphanedUsers() });

      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );
      const previousOrphaned = queryClient.getQueryData<User[]>(
        adminKeys.orphanedUsers()
      );

      // Find the member being removed
      let removedMember: Member | undefined;
      let removedUserId: string | undefined;
      previousOrgs?.forEach((org) => {
        const member = org.members?.find((m) => m.id === variables.memberId);
        if (member) {
          removedMember = member;
          removedUserId = member.userId;
        }
      });

      // Optimistically remove member
      const updatedOrgs = previousOrgs?.map((org) => ({
        ...org,
        members: org.members?.filter(
          (member) => member.id !== variables.memberId
        ),
      }));

      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        updatedOrgs
      );

      // Check if user has any other org memberships
      const hasOtherMemberships = updatedOrgs?.some((org) =>
        org.members?.some((m) => m.userId === removedUserId)
      );

      // If user has no other memberships, add them to orphaned users
      if (!hasOtherMemberships && removedMember?.user && removedUserId) {
        queryClient.setQueryData<User[]>(adminKeys.orphanedUsers(), (old) => {
          const userAsOrphaned: User = {
            id: removedUserId!,
            email: removedMember!.user!.email,
            name: removedMember!.user!.name || "",
            emailVerified: false,
            createdAt: removedMember!.createdAt,
          };
          return old ? [...old, userAsOrphaned] : [userAsOrphaned];
        });
      }

      return { previousOrgs, previousOrphaned };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
      if (context?.previousOrphaned) {
        queryClient.setQueryData(
          adminKeys.orphanedUsers(),
          context.previousOrphaned
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
      queryClient.invalidateQueries({ queryKey: adminKeys.orphanedUsers() });
    },
  });
}

// Update Member Role
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { memberId: string; role: string }) => {
      const response = await fetch("/api/admin/update-member-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update member role");
      return response.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });

      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );

      // Optimistically update member role
      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) =>
          old?.map((org) => ({
            ...org,
            members: org.members?.map((member) =>
              member.id === variables.memberId
                ? { ...member, role: variables.role }
                : member
            ),
          }))
      );

      return { previousOrgs };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
    },
  });
}

// Bulk Add Members (for orphaned users)
export function useBulkAddMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      userIds: string[];
      organizationId: string;
      role: string;
    }) => {
      const promises = data.userIds.map((userId) =>
        fetch("/api/admin/add-member", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            organizationId: data.organizationId,
            role: data.role,
          }),
        }).then((res) => {
          if (!res.ok) throw new Error(`Failed to add user ${userId}`);
          return res.json();
        })
      );
      return Promise.all(promises);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.organizations() });
      await queryClient.cancelQueries({ queryKey: adminKeys.orphanedUsers() });

      const previousOrgs = queryClient.getQueryData<Organization[]>(
        adminKeys.organizations()
      );
      const previousOrphaned = queryClient.getQueryData<User[]>(
        adminKeys.orphanedUsers()
      );

      // Get user details from orphaned users list for optimistic update
      const orphanedUsers = queryClient.getQueryData<User[]>(
        adminKeys.orphanedUsers()
      );

      // Optimistically update organizations with full user details
      queryClient.setQueryData<Organization[]>(
        adminKeys.organizations(),
        (old) =>
          old?.map((org) =>
            org.id === variables.organizationId
              ? {
                  ...org,
                  members: [
                    ...(org.members || []),
                    ...variables.userIds.map((userId) => {
                      const userDetails = orphanedUsers?.find(
                        (u) => u.id === userId
                      );
                      return {
                        id: `temp-${userId}-${Date.now()}`,
                        userId,
                        role: variables.role,
                        createdAt: new Date(),
                        user: userDetails
                          ? {
                              email: userDetails.email,
                              name: userDetails.name,
                            }
                          : undefined,
                      };
                    }),
                  ],
                }
              : org
          )
      );

      // Remove from orphaned users
      queryClient.setQueryData<User[]>(adminKeys.orphanedUsers(), (old) =>
        old?.filter((user) => !variables.userIds.includes(user.id))
      );

      return { previousOrgs, previousOrphaned };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(
          adminKeys.organizations(),
          context.previousOrgs
        );
      }
      if (context?.previousOrphaned) {
        queryClient.setQueryData(
          adminKeys.orphanedUsers(),
          context.previousOrphaned
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.organizations() });
      queryClient.invalidateQueries({ queryKey: adminKeys.orphanedUsers() });
    },
  });
}
