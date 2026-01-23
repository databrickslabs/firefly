"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FolderTree,
  Database,
  Users,
  UserCheck,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupMember {
  value: string;
  display: string;
}

interface GroupInfo {
  id: string;
  displayName: string;
  memberCount: number;
  members: GroupMember[];
}

interface MissingMember {
  email: string;
  name: string;
}

type PermissionCategory = "prerequisite" | "metadata" | "read" | "edit" | "create";

interface CatalogPermissions {
  grantedPermissions: string[];
  permissionsByCategory: Record<PermissionCategory, { permission: string; granted: boolean }[]>;
  hasAllPrivileges: boolean;
  error?: string;
}

interface VolumeInfo {
  name: string;
  fullName: string;
  volumeType: string;
  owner: string | null;
  storageLocation: string | null;
  createdAt: number | null;
}

interface UserVolumeStatus {
  email: string;
  name: string;
  expectedVolumeName: string;
  hasVolume: boolean;
}

interface UploadsSchemaInfo {
  exists: boolean;
  fullName: string | null;
  name: string | null;
  catalogName: string | null;
  owner: string | null;
  createdAt: number | null;
  volumes: VolumeInfo[];
  volumeCount: number;
  userVolumes: UserVolumeStatus[];
  usersWithoutVolumes: number;
  error?: string;
}

interface StorageSettingsStatus {
  hasStorageSettings: boolean;
  groupExists: boolean;
  groupInfo: GroupInfo | null;
  storageSettings: {
    primaryOrganizationGroup: string | null;
    primaryOrganizationGroupId: string | null;
    organizationEditableCatalog: string | null;
  } | null;
  missingMembers: MissingMember[];
  missingMemberCount: number;
  catalogPermissions: CatalogPermissions | null;
  uploadsSchema: UploadsSchemaInfo | null;
  error?: string;
}

const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  prerequisite: "Prerequisite",
  metadata: "Metadata",
  read: "Read",
  edit: "Edit",
  create: "Create",
};

function formatPermissionName(permission: string): string {
  return permission.replace(/_/g, " ");
}

interface ChecklistItemProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isConfigured: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function ChecklistItem({
  title,
  description,
  icon,
  isConfigured,
  isLoading = false,
  children,
  defaultOpen = false,
}: ChecklistItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(
        "transition-all",
        !isConfigured && !isLoading && "border-orange-200 dark:border-orange-900/50"
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  isLoading
                    ? "bg-muted"
                    : isConfigured
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : "bg-orange-100 dark:bg-orange-900/30"
                )}>
                  {icon}
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {title}
                    {isLoading ? (
                      <Spinner className="h-4 w-4 text-muted-foreground" />
                    ) : isConfigured ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                    )}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {description}
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={cn(
                "h-5 w-5 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 border-t">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function StorageSettingsPage() {
  const [missingMembersModalOpen, setMissingMembersModalOpen] = useState(false);
  const [volumesModalOpen, setVolumesModalOpen] = useState(false);
  const [userVolumesModalOpen, setUserVolumesModalOpen] = useState(false);

  // Fetch storage settings status from the API
  const { data: storageStatus, isLoading, refetch, isRefetching } = useQuery<{ data: StorageSettingsStatus }>({
    queryKey: ["storage-settings-status"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/storage-settings/verify-group");
      if (!response.ok) {
        throw new Error("Failed to fetch storage settings status");
      }
      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const status = storageStatus?.data;
  const groupConfigured = status?.groupExists ?? false;
  const catalogConfigured = !!status?.storageSettings?.organizationEditableCatalog;
  const missingMemberCount = status?.missingMemberCount ?? 0;
  const missingMembers = status?.missingMembers ?? [];
  const catalogPermissions = status?.catalogPermissions ?? null;
  const uploadsSchema = status?.uploadsSchema ?? null;

  // Group members configured when there are no missing members
  const groupMembersConfigured = groupConfigured && missingMemberCount === 0;

  // Catalog permissions configured when the group has all essential permissions (or ALL_PRIVILEGES)
  const catalogPermissionsConfigured = catalogPermissions?.hasAllPrivileges ||
    (catalogPermissions?.permissionsByCategory?.prerequisite?.every(p => p.granted) ?? false);

  // Uploads schema configured when it exists in the catalog
  const uploadsSchemaConfigured = uploadsSchema?.exists ?? false;

  const configuredCount = [
    groupConfigured,
    catalogConfigured,
    catalogPermissionsConfigured,
    uploadsSchemaConfigured,
    groupMembersConfigured,
  ].filter(Boolean).length;

  const totalItems = 5;

  return (
    <div className="p-8">
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Storage Setup</h1>
            <p className="text-muted-foreground">
              Configure Unity Catalog, volumes, and access groups for your organization.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Progress indicator */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Setup Progress</span>
              <span className="text-sm text-muted-foreground">
                {isLoading ? "Loading..." : `${configuredCount} of ${totalItems} completed`}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  configuredCount === totalItems
                    ? "bg-emerald-600"
                    : "bg-orange-500"
                )}
                style={{ width: isLoading ? "0%" : `${(configuredCount / totalItems) * 100}%` }}
              />
            </div>
            {!isLoading && configuredCount < totalItems && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Complete all items to enable full storage functionality
              </p>
            )}
          </CardContent>
        </Card>

        {/* Checklist Items */}
        <div className="space-y-4">
          {/* 1. Access Group - Must be first since it holds permissions */}
          <ChecklistItem
            title="Access Group"
            description="Group for managing access to storage resources"
            icon={<Users className={cn(
              "h-5 w-5",
              isLoading ? "text-muted-foreground" : groupConfigured ? "text-emerald-600" : "text-orange-500"
            )} />}
            isConfigured={groupConfigured}
            isLoading={isLoading}
            defaultOpen={!isLoading && !groupConfigured}
          >
            <div className="space-y-4 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6 text-emerald-600" />
                </div>
              ) : !status?.hasStorageSettings ? (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Storage settings have not been configured for this organization yet.
                    Please contact your administrator to set up storage settings.
                  </p>
                </div>
              ) : groupConfigured ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Group Verified</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The access group exists in the Databricks workspace.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Group Name</span>
                      <span className="text-sm font-mono">{status?.groupInfo?.displayName || status?.storageSettings?.primaryOrganizationGroup}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Group ID</span>
                      <span className="text-sm font-mono">{status?.storageSettings?.primaryOrganizationGroupId}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Members</span>
                      <span className="text-sm font-mono">{status?.groupInfo?.memberCount ?? 0}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-dashed p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-orange-700 dark:text-orange-400">Group Not Found</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {status?.error || "The configured group could not be found in the Databricks workspace. Please contact your administrator."}
                    </p>
                  </div>
                  {status?.storageSettings?.primaryOrganizationGroupId && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm text-muted-foreground">Expected Group Name</span>
                        <span className="text-sm font-mono">{status?.storageSettings?.primaryOrganizationGroup}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm text-muted-foreground">Expected Group ID</span>
                        <span className="text-sm font-mono">{status?.storageSettings?.primaryOrganizationGroupId}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ChecklistItem>

          {/* 2. Unity Catalog */}
          <ChecklistItem
            title="Unity Catalog"
            description="Catalog for your organization's data"
            icon={<FolderTree className={cn(
              "h-5 w-5",
              isLoading ? "text-muted-foreground" : catalogConfigured ? "text-emerald-600" : "text-orange-500"
            )} />}
            isConfigured={catalogConfigured}
            isLoading={isLoading}
          >
            <div className="space-y-4 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6 text-emerald-600" />
                </div>
              ) : catalogConfigured ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Catalog Configured</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The organization has an editable catalog configured.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm text-muted-foreground">Catalog Name</span>
                    <span className="text-sm font-mono">{status?.storageSettings?.organizationEditableCatalog}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    No catalog has been configured for this organization yet.
                    Please contact your administrator to set up a catalog.
                  </p>
                </div>
              )}
            </div>
          </ChecklistItem>

          {/* 3. Catalog Permissions */}
          <ChecklistItem
            title="Catalog Permissions"
            description="Verify group has required permissions on the catalog"
            icon={<Shield className={cn(
              "h-5 w-5",
              isLoading ? "text-muted-foreground" : catalogPermissionsConfigured ? "text-emerald-600" : "text-orange-500"
            )} />}
            isConfigured={catalogPermissionsConfigured}
            isLoading={isLoading}
            defaultOpen={!isLoading && !catalogPermissionsConfigured && catalogConfigured && groupConfigured}
          >
            <div className="space-y-4 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6 text-emerald-600" />
                </div>
              ) : !catalogConfigured || !groupConfigured ? (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    {!catalogConfigured && !groupConfigured
                      ? "Catalog and Access Group must be configured first."
                      : !catalogConfigured
                      ? "Catalog must be configured first."
                      : "Access Group must be configured first."}
                  </p>
                </div>
              ) : catalogPermissions?.error ? (
                <div className="rounded-lg border border-dashed p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="font-medium text-orange-700 dark:text-orange-400">Error Fetching Permissions</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{catalogPermissions.error}</p>
                </div>
              ) : catalogPermissions?.hasAllPrivileges ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">All Privileges Granted</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The group has ALL_PRIVILEGES on the catalog, granting full access.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Permission categories in compact horizontal layout */}
                  {catalogPermissions?.permissionsByCategory && (
                    Object.entries(catalogPermissions.permissionsByCategory).map(([category, permissions]) => (
                      <div key={category} className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {CATEGORY_LABELS[category as PermissionCategory]}
                        </h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {permissions.map(({ permission, granted }) => (
                            <div
                              key={permission}
                              className="flex items-center gap-1.5 text-sm"
                            >
                              <span className={cn(
                                "text-xs",
                                granted ? "text-emerald-600" : "text-orange-500"
                              )}>
                                {formatPermissionName(permission)}
                              </span>
                              {granted ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-orange-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </ChecklistItem>

          {/* 4. Volumes */}
          <ChecklistItem
            title="Volumes"
            description="Verify the uploads schema exists for storing files and data"
            icon={<Database className={cn(
              "h-5 w-5",
              isLoading ? "text-muted-foreground" : uploadsSchemaConfigured ? "text-emerald-600" : "text-orange-500"
            )} />}
            isConfigured={uploadsSchemaConfigured}
            isLoading={isLoading}
            defaultOpen={!isLoading && !uploadsSchemaConfigured && catalogConfigured}
          >
            <div className="space-y-4 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6 text-emerald-600" />
                </div>
              ) : !catalogConfigured ? (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Catalog must be configured first before checking the uploads schema.
                  </p>
                </div>
              ) : uploadsSchema?.error ? (
                <div className="rounded-lg border border-dashed p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="font-medium text-orange-700 dark:text-orange-400">Error Checking Schema</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{uploadsSchema.error}</p>
                </div>
              ) : uploadsSchemaConfigured ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Uploads Schema Exists</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The uploads schema is configured and ready for storing files.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Schema Name</span>
                      <span className="text-sm font-mono">{uploadsSchema?.fullName}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Volumes</span>
                      {(uploadsSchema?.volumeCount ?? 0) > 0 ? (
                        <button
                          type="button"
                          className="text-sm font-mono text-emerald-600 hover:underline"
                          onClick={() => setVolumesModalOpen(true)}
                        >
                          {uploadsSchema?.volumeCount ?? 0}
                        </button>
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">0</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">User Volumes</span>
                      <div className="flex items-center gap-2">
                        {(uploadsSchema?.usersWithoutVolumes ?? 0) > 0 ? (
                          <>
                            <span className="text-sm font-mono">
                              {(uploadsSchema?.userVolumes?.filter(u => u.hasVolume).length ?? 0)} / {(uploadsSchema?.userVolumes?.length ?? 0)}
                            </span>
                            <button
                              type="button"
                              className="text-sm text-orange-500 hover:underline"
                              onClick={() => setUserVolumesModalOpen(true)}
                            >
                              ({uploadsSchema?.usersWithoutVolumes} missing)
                            </button>
                          </>
                        ) : (uploadsSchema?.userVolumes?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            className="text-sm font-mono text-emerald-600 hover:underline"
                            onClick={() => setUserVolumesModalOpen(true)}
                          >
                            {uploadsSchema?.userVolumes?.length ?? 0} / {uploadsSchema?.userVolumes?.length ?? 0}
                          </button>
                        ) : (
                          <span className="text-sm font-mono text-muted-foreground">No users</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-dashed p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-orange-700 dark:text-orange-400">Schema Not Found</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The uploads schema does not exist. Please create a schema named &quot;uploads&quot; in the catalog.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm text-muted-foreground">Expected Schema</span>
                    <span className="text-sm font-mono">{uploadsSchema?.fullName || `${status?.storageSettings?.organizationEditableCatalog}.uploads`}</span>
                  </div>
                </div>
              )}
            </div>
          </ChecklistItem>

          {/* 5. Group Members in Workspace */}
          <ChecklistItem
            title="Group Members in Workspace"
            description="Ensure group members are properly added to the workspace"
            icon={<UserCheck className={cn(
              "h-5 w-5",
              isLoading ? "text-muted-foreground" : groupMembersConfigured ? "text-emerald-600" : "text-orange-500"
            )} />}
            isConfigured={groupMembersConfigured}
            isLoading={isLoading}
            defaultOpen={!isLoading && !groupMembersConfigured && groupConfigured}
          >
            <div className="space-y-4 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6 text-emerald-600" />
                </div>
              ) : !groupConfigured ? (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Access Group must be configured first before checking member status.
                  </p>
                </div>
              ) : groupMembersConfigured ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">All Members in Group</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      All organization users are members of the access group.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm text-muted-foreground">Group Members</span>
                    <span className="text-sm font-mono">{status?.groupInfo?.memberCount ?? 0}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Warning banner for missing members */}
                  <div className="rounded-lg border border-dashed p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-orange-700 dark:text-orange-400">Missing Members Detected</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {missingMemberCount} User{missingMemberCount !== 1 ? "s are" : " is"} not in the access group.{" "}
                      <button
                        type="button"
                        className="text-orange-600 dark:text-orange-400 underline hover:no-underline font-medium"
                        onClick={() => setMissingMembersModalOpen(true)}
                      >
                        View missing members
                      </button>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Group Members</span>
                      <span className="text-sm font-mono">{status?.groupInfo?.memberCount ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm text-muted-foreground">Missing from Group</span>
                      <button
                        type="button"
                        className="text-sm font-mono text-orange-500 hover:underline"
                        onClick={() => setMissingMembersModalOpen(true)}
                      >
                        {missingMemberCount}
                      </button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
                    Refresh Status
                  </Button>
                </div>
              )}
            </div>
          </ChecklistItem>
        </div>
      </div>

      {/* Missing Members Modal */}
      <Dialog open={missingMembersModalOpen} onOpenChange={setMissingMembersModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Missing Group Members
            </DialogTitle>
            <DialogDescription>
              The following users are not members of the access group. They need to be added to gain access to storage resources.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No missing members
                    </TableCell>
                  </TableRow>
                ) : (
                  missingMembers.map((member) => (
                    <TableRow key={member.email}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setMissingMembersModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Volumes Modal */}
      <Dialog open={volumesModalOpen} onOpenChange={setVolumesModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              Volumes in Uploads Schema
            </DialogTitle>
            <DialogDescription>
              The following volumes are available in the {uploadsSchema?.fullName} schema.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(uploadsSchema?.volumes?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No volumes found
                    </TableCell>
                  </TableRow>
                ) : (
                  uploadsSchema?.volumes?.map((volume) => (
                    <TableRow key={volume.fullName}>
                      <TableCell className="font-medium">{volume.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{volume.fullName}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          volume.volumeType === "MANAGED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {volume.volumeType}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setVolumesModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Volumes Modal */}
      <Dialog open={userVolumesModalOpen} onOpenChange={setUserVolumesModalOpen}>
        <DialogContent className="max-w-7xl w-[90vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              User Volumes Status
            </DialogTitle>
            <DialogDescription>
              Each user should have a dedicated volume in the uploads schema. Volume names are derived from user emails.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Expected Volume Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(uploadsSchema?.userVolumes?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  uploadsSchema?.userVolumes?.map((userVolume) => (
                    <TableRow key={userVolume.email}>
                      <TableCell className="font-medium">{userVolume.name}</TableCell>
                      <TableCell className="text-muted-foreground">{userVolume.email}</TableCell>
                      <TableCell className="font-mono text-sm">{userVolume.expectedVolumeName}</TableCell>
                      <TableCell>
                        {userVolume.hasVolume ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <Check className="h-4 w-4" />
                            <span className="text-xs">Exists</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-orange-500">
                            <X className="h-4 w-4" />
                            <span className="text-xs">Missing</span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setUserVolumesModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
