"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Key, Calendar, Building2, AlertCircle } from "lucide-react";

interface UserSpnDetailsResponse {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };
  spnMapping: {
    hasMapping: boolean;
    clientId: string | null;
    clientSecretPreview: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  organization: {
    name: string;
    workspaceUrl: string | null;
  };
}

interface UserSpnDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName: string | null;
  apiEndpoint?: string;
  accentColor?: "emerald" | "purple";
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-sm font-mono break-all">{value}</span>
    </div>
  );
}

function getRoleBadgeClass(role: string) {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "admin":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserSpnDetailsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  apiEndpoint = "/api/sso-spn/user-spn-details",
  accentColor = "emerald",
}: UserSpnDetailsDialogProps) {
  const colorClasses = {
    icon: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
    spinner: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
  };

  const { data, isLoading, error } = useQuery<{ data: UserSpnDetailsResponse }>({
    queryKey: ["user-spn-details", userId],
    queryFn: async () => {
      const response = await fetch(`${apiEndpoint}?userId=${userId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch user details");
      }
      return response.json();
    },
    enabled: open && !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const userDetails = data?.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className={`h-5 w-5 ${colorClasses.icon}`} />
            {userName || "User Details"}
          </DialogTitle>
          <DialogDescription>
            View user information and SPN configuration
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Spinner className={`w-8 h-8 ${colorClasses.spinner} mx-auto`} />
              <p className="text-sm text-muted-foreground">Loading user details...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-600">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load user information</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {userDetails && !isLoading && (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-6 pr-4">
              {/* User Info Section */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  User Information
                </h3>
                <div className="rounded-lg border p-4 space-y-0">
                  <InfoRow label="Name" value={userDetails.user.name || "Not set"} />
                  <InfoRow label="Email" value={userDetails.user.email} />
                  <div className="flex flex-col gap-1 py-3 border-b border-border">
                    <span className="text-xs text-muted-foreground font-medium">Organization Role</span>
                    <span className={`inline-flex w-fit px-2 py-0.5 text-xs font-medium rounded ${getRoleBadgeClass(userDetails.user.role)}`}>
                      {userDetails.user.role.charAt(0).toUpperCase() + userDetails.user.role.slice(1)}
                    </span>
                  </div>
                  <InfoRow
                    label="Organization"
                    value={userDetails.organization.name}
                    icon={Building2}
                  />
                </div>
              </div>

              {/* SPN Mapping Section */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Service Principal Mapping
                </h3>
                {userDetails.spnMapping.hasMapping ? (
                  <div className="rounded-lg border p-4 space-y-0">
                    <InfoRow
                      label="Client ID"
                      value={userDetails.spnMapping.clientId || "N/A"}
                    />
                    <InfoRow
                      label="Client Secret"
                      value={userDetails.spnMapping.clientSecretPreview || "N/A"}
                    />
                    <InfoRow
                      label="Created"
                      value={formatDate(userDetails.spnMapping.createdAt)}
                      icon={Calendar}
                    />
                    <InfoRow
                      label="Last Updated"
                      value={formatDate(userDetails.spnMapping.updatedAt)}
                      icon={Calendar}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No SPN mapping configured for this user
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The user needs to have an SPN (Service Principal) mapped to their email to access Databricks resources.
                    </p>
                  </div>
                )}
              </div>

              {/* Workspace Info */}
              {userDetails.organization.workspaceUrl && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Workspace
                  </h3>
                  <div className="rounded-lg border p-4">
                    <InfoRow
                      label="Workspace URL"
                      value={userDetails.organization.workspaceUrl}
                    />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
