"use client";

import { useEffect, useState } from "react";
import { Building2, Globe, Users, ExternalLink } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  metadata: string | null;
  workspaceUrl?: string | null;
  createdAt: Date;
  members?: Array<{
    id: string;
    role: string;
    userId: string;
  }>;
}

interface OrganizationListProps {
  refresh?: number;
}

export function OrganizationList({ refresh }: OrganizationListProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganizations() {
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
        console.error("Error fetching organizations:", err);
        setError(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    }

    fetchOrganizations();
  }, [refresh]);

  const getWorkspaceUrl = (org: Organization): string | null => {
    // First check if workspaceUrl is a direct field (from additionalFields)
    if (org.workspaceUrl) return org.workspaceUrl;

    // Fallback to metadata for backwards compatibility
    if (!org.metadata) return null;
    try {
      const metadata = typeof org.metadata === "string"
        ? JSON.parse(org.metadata)
        : org.metadata;
      return metadata.workspaceUrl || null;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading organizations...</p>
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
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Organizations</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {organizations.length} {organizations.length === 1 ? "organization" : "organizations"}
        </span>
      </div>

      {organizations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No organizations found</p>
          <p className="text-sm mt-1">Create your first organization to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => {
            const workspaceUrl = getWorkspaceUrl(org);
            return (
              <div
                key={org.id}
                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {org.logo && (
                    <img
                      src={org.logo}
                      alt={`${org.name} logo`}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-lg">{org.name}</h3>
                        {org.slug && (
                          <p className="text-sm text-muted-foreground">
                            @{org.slug}
                          </p>
                        )}
                      </div>
                      {org.members && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{org.members.length}</span>
                        </div>
                      )}
                    </div>

                    {workspaceUrl && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={workspaceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          {workspaceUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(org.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
