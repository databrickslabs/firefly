"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeyRound, Globe, Share2, Plus, ArrowLeft, Trash2, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Loader2, Settings, Database, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryState, parseAsString } from "nuqs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { ShareDetailsButton } from "@/components/byod/share-details-modal";

interface DataPlatform {
  id: string;
  name: string;
  description: string;
  logo: string;
  bgColor: string;
}

const dataPlatforms: DataPlatform[] = [
  {
    id: "databricks",
    name: "Databricks",
    description: "Connect via Service Principals",
    logo: "/logos/databricks.svg",
    bgColor: "bg-red-50 dark:bg-red-950/30",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    description: "Connect via account credentials",
    logo: "/logos/snowflake.svg",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Connect via connection string",
    logo: "/logos/postgres.png",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "mysql",
    name: "MySQL",
    description: "Connect via connection string",
    logo: "/logos/mysql.svg",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "bigquery",
    name: "BigQuery",
    description: "Connect via service account",
    logo: "/logos/bigquery.svg",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "redshift",
    name: "Redshift",
    description: "Connect via IAM credentials",
    logo: "/logos/redshift.svg",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
];

interface ByodSpn {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string; // Masked client secret from API
  createdAt: string;
  updatedAt: string;
}

interface ByodWorkspace {
  id: string;
  name: string | null;
  workspaceUrl: string;
  spnId: string;
  spnName: string;
  spnClientId: string;
  deltaSharingGlobalMetastoreId: string | null;
  deltaSharingOrganizationName: string | null;
  deltaSharingScope: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ValidationCheck {
  name: string;
  status: "pending" | "success" | "error";
  message?: string;
}

interface ValidationResult {
  workspaceId: string;
  validation: {
    workspaceAccess: ValidationCheck;
    metastoreId: ValidationCheck;
    externalSharingEnabled: ValidationCheck;
  };
  deltaSharingFields: {
    deltaSharingGlobalMetastoreId: string | null;
    deltaSharingOrganizationName: string | null;
    deltaSharingScope: string | null;
  };
}

interface ByodMetastore {
  id: string;
  globalMetastoreId: string;
  name: string;
  sharingOrganizationName: string | null;
  scope: string | null;
  createdAt: string;
  updatedAt: string;
}

// Combined metastore for display (from manual or workspace)
interface CombinedMetastore {
  id: string;
  globalMetastoreId: string;
  name: string;
  sharingOrganizationName: string | null;
  scope: string | null;
  source: "manual" | "workspace";
  workspaceUrl?: string;
}

// Provider API response types
interface ProviderInfo {
  name: string;
  data_provider_global_metastore_id?: string;
  authentication_type?: string;
  comment?: string;
  owner?: string;
  cloud?: string;
  region?: string;
}

interface ShareInfo {
  name: string;
}

interface ProviderResult {
  metastoreGlobalId: string;
  metastoreName: string;
  hasProvider: boolean;
  provider?: ProviderInfo;
  shares: ShareInfo[];
  error?: string;
}

interface ProvidersResponse {
  workspaceUrl: string;
  organizationName: string;
  results: ProviderResult[];
}

// Shared catalog cached in database
interface SharedCatalog {
  id: string;
  organizationId: string;
  providerName: string;
  shareName: string;
  catalogName: string;
  catalogType: string | null;
  metastoreId: string | null;
  isValid: string;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CatalogsResponse {
  catalogs: SharedCatalog[];
  fromCache: boolean;
}

function DatabricksConfig() {
  const queryClient = useQueryClient();
  const [showAddSpnDialog, setShowAddSpnDialog] = useState(false);
  const [showAddWorkspaceDialog, setShowAddWorkspaceDialog] = useState(false);
  const [showAddMetastoreDialog, setShowAddMetastoreDialog] = useState(false);
  const [showDeleteSpnDialog, setShowDeleteSpnDialog] = useState<ByodSpn | null>(null);
  const [showDeleteWorkspaceDialog, setShowDeleteWorkspaceDialog] = useState<ByodWorkspace | null>(null);
  const [showDeleteMetastoreDialog, setShowDeleteMetastoreDialog] = useState<ByodMetastore | null>(null);
  const [showUnmountCatalogDialog, setShowUnmountCatalogDialog] = useState<SharedCatalog | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [validationStatus, setValidationStatus] = useState<Record<string, ValidationResult | "loading" | null>>({});

  // State for tracking catalog mounting operations
  const [mountingCatalogs, setMountingCatalogs] = useState<Record<string, string>>({});

  // Form state for new SPN
  const [newSpnName, setNewSpnName] = useState("");
  const [newSpnClientId, setNewSpnClientId] = useState("");
  const [newSpnClientSecret, setNewSpnClientSecret] = useState("");

  // Form state for new Workspace
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceUrl, setNewWorkspaceUrl] = useState("");
  const [newWorkspaceSpnId, setNewWorkspaceSpnId] = useState("");

  // Form state for new Metastore
  const [newMetastoreName, setNewMetastoreName] = useState("");
  const [newMetastoreGlobalId, setNewMetastoreGlobalId] = useState("");
  const [newMetastoreSharingName, setNewMetastoreSharingName] = useState("");
  const [newMetastoreScope, setNewMetastoreScope] = useState("");

  // Fetch SPNs
  const { data: spnsData, isLoading: spnsLoading } = useQuery({
    queryKey: ["byod-databricks-spns"],
    queryFn: async () => {
      const res = await fetch("/api/sso-spn/byod/databricks/spns");
      if (!res.ok) throw new Error("Failed to fetch SPNs");
      return res.json() as Promise<ByodSpn[]>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch Workspaces
  const { data: workspacesData, isLoading: workspacesLoading } = useQuery({
    queryKey: ["byod-databricks-workspaces"],
    queryFn: async () => {
      const res = await fetch("/api/sso-spn/byod/databricks/workspaces");
      if (!res.ok) throw new Error("Failed to fetch Workspaces");
      return res.json() as Promise<ByodWorkspace[]>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch Metastores (manually configured)
  const { data: metastoresData, isLoading: metastoresLoading } = useQuery({
    queryKey: ["byod-databricks-metastores"],
    queryFn: async () => {
      const res = await fetch("/api/sso-spn/byod/databricks/metastores");
      if (!res.ok) throw new Error("Failed to fetch Metastores");
      return res.json() as Promise<ByodMetastore[]>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch Providers for all metastores
  const { data: providersData, isLoading: providersLoading, isFetching: providersFetching, refetch: refetchProviders } = useQuery({
    queryKey: ["byod-databricks-providers"],
    queryFn: async () => {
      const res = await fetch("/api/sso-spn/byod/databricks/providers");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch providers");
      }
      return res.json() as Promise<ProvidersResponse>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Only run when we have metastores configured
    enabled: !metastoresLoading && !workspacesLoading,
  });

  // Fetch shared catalogs from cache (no validation - fast)
  const { data: catalogsData, isLoading: catalogsLoading, isFetching: catalogsFetching, refetch: refetchCatalogs } = useQuery({
    queryKey: ["byod-databricks-catalogs"],
    queryFn: async () => {
      // No refresh param - just return cached catalogs (fast)
      const res = await fetch("/api/sso-spn/byod/databricks/catalogs");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch catalogs");
      }
      return res.json() as Promise<CatalogsResponse>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Only run after providers are loaded
    enabled: !providersLoading && !!providersData,
  });

  // Helper to get catalogs for a specific provider/share
  const getCatalogsForShare = (providerName: string, shareName: string): SharedCatalog[] => {
    if (!catalogsData?.catalogs) return [];
    return catalogsData.catalogs.filter(
      (cat) => cat.providerName === providerName && cat.shareName === shareName && cat.isValid === "valid"
    );
  };

  // Generate a valid catalog name from organization name (from better-auth) and share name
  // Format: {organizationName}_{shareName} - lowercase, special chars to underscores
  const generateCatalogName = (shareName: string): string => {
    const orgName = providersData?.organizationName || "byod";
    const combined = `${orgName}_${shareName}`;
    return combined.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
  };

  // Mount catalog mutation with optimistic updates
  const mountCatalogMutation = useMutation({
    mutationFn: async (data: { providerName: string; shareName: string; catalogName: string }) => {
      const res = await fetch("/api/sso-spn/byod/databricks/catalogs/mount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to mount catalog");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      const key = `${variables.providerName}__${variables.shareName}`;
      setMountingCatalogs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      // Optimistically add the catalog to the cache immediately
      queryClient.setQueryData<CatalogsResponse>(["byod-databricks-catalogs"], (old) => {
        if (!old) return old;
        // Check if already exists (avoid duplicates)
        const exists = old.catalogs.some(
          (c) => c.providerName === variables.providerName &&
                 c.shareName === variables.shareName &&
                 c.catalogName === variables.catalogName
        );
        if (exists) return old;

        const optimisticCatalog: SharedCatalog = {
          id: `optimistic-${Date.now()}`,
          organizationId: "",
          providerName: variables.providerName,
          shareName: variables.shareName,
          catalogName: variables.catalogName,
          catalogType: "DELTASHARING_CATALOG",
          metastoreId: null,
          isValid: "valid",
          lastValidatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return {
          ...old,
          catalogs: [...old.catalogs, optimisticCatalog],
        };
      });

      // Also invalidate to get real data in background
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-catalogs"] });

      if (data.permissionsGranted) {
        toast.success(`Catalog "${variables.catalogName}" mounted successfully`);
      } else {
        toast.success(`Catalog "${variables.catalogName}" mounted, but permissions could not be set. Contact your administrator.`);
      }
    },
    onError: (error: Error, variables) => {
      const key = `${variables.providerName}__${variables.shareName}`;
      setMountingCatalogs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.error(error.message);
    },
  });

  // Handle mount catalog button click
  const handleMountCatalog = (providerName: string, shareName: string, catalogName: string) => {
    const key = `${providerName}__${shareName}`;
    setMountingCatalogs((prev) => ({ ...prev, [key]: catalogName }));
    mountCatalogMutation.mutate({ providerName, shareName, catalogName });
  };

  // Unmount catalog mutation with optimistic updates
  const unmountCatalogMutation = useMutation({
    mutationFn: async (data: { catalogName: string }) => {
      const res = await fetch("/api/sso-spn/byod/databricks/catalogs/unmount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to unmount catalog");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Optimistically remove the catalog from the cache immediately
      queryClient.setQueryData<CatalogsResponse>(["byod-databricks-catalogs"], (old) => {
        if (!old) return old;
        return {
          ...old,
          catalogs: old.catalogs.filter((c) => c.catalogName !== variables.catalogName),
        };
      });

      // Also invalidate to get real data in background
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-catalogs"] });

      setShowUnmountCatalogDialog(null);
      toast.success(`Catalog "${variables.catalogName}" unmounted successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Check if a catalog is being mounted
  const isMountingCatalog = (providerName: string, shareName: string): string | null => {
    const key = `${providerName}__${shareName}`;
    return mountingCatalogs[key] || null;
  };

  // Create SPN mutation
  const createSpnMutation = useMutation({
    mutationFn: async (data: { name: string; clientId: string; clientSecret: string }) => {
      const res = await fetch("/api/sso-spn/byod/databricks/spns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create SPN");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-spns"] });
      setShowAddSpnDialog(false);
      setNewSpnName("");
      setNewSpnClientId("");
      setNewSpnClientSecret("");
      toast.success("Service Principal added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete SPN mutation
  const deleteSpnMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sso-spn/byod/databricks/spns?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete SPN");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-spns"] });
      setShowDeleteSpnDialog(null);
      toast.success("Service Principal deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Create Workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: { name?: string; workspaceUrl: string; spnId: string }) => {
      const res = await fetch("/api/sso-spn/byod/databricks/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create Workspace");
      }
      return res.json() as Promise<ByodWorkspace>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-workspaces"] });
      setShowAddWorkspaceDialog(false);
      setNewWorkspaceName("");
      setNewWorkspaceUrl("");
      setNewWorkspaceSpnId("");
      toast.success("Workspace added successfully. Validating...");
      // Trigger validation after creation
      validateWorkspace(data.id);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete Workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sso-spn/byod/databricks/workspaces?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete Workspace");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-workspaces"] });
      setShowDeleteWorkspaceDialog(null);
      toast.success("Workspace deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Create Metastore mutation
  const createMetastoreMutation = useMutation({
    mutationFn: async (data: { name: string; globalMetastoreId: string; sharingOrganizationName?: string; scope?: string }) => {
      const res = await fetch("/api/sso-spn/byod/databricks/metastores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create Metastore");
      }
      return res.json() as Promise<ByodMetastore>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-metastores"] });
      setShowAddMetastoreDialog(false);
      setNewMetastoreName("");
      setNewMetastoreGlobalId("");
      setNewMetastoreSharingName("");
      setNewMetastoreScope("");
      toast.success("Metastore added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete Metastore mutation
  const deleteMetastoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sso-spn/byod/databricks/metastores?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete Metastore");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-metastores"] });
      setShowDeleteMetastoreDialog(null);
      toast.success("Metastore deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Validate workspace function
  const validateWorkspace = async (workspaceId: string) => {
    setValidationStatus(prev => ({ ...prev, [workspaceId]: "loading" }));
    try {
      const res = await fetch("/api/sso-spn/byod/databricks/workspaces/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Validation failed");
      }
      const result = await res.json() as ValidationResult;
      setValidationStatus(prev => ({ ...prev, [workspaceId]: result }));
      // Refetch workspaces to get updated delta sharing fields
      queryClient.invalidateQueries({ queryKey: ["byod-databricks-workspaces"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Validation failed");
      setValidationStatus(prev => ({ ...prev, [workspaceId]: null }));
    }
  };

  // Track which workspaces have been auto-validated to prevent duplicate triggers
  const autoValidatedRef = useRef<Set<string>>(new Set());

  // Auto-validate workspaces on mount when data loads
  useEffect(() => {
    if (!workspacesData || workspacesLoading) return;

    // Validate each workspace that hasn't been validated yet
    for (const workspace of workspacesData) {
      // Skip if already auto-validated or currently being validated
      if (autoValidatedRef.current.has(workspace.id)) continue;
      if (validationStatus[workspace.id] === "loading") continue;

      // Mark as auto-validated to prevent re-triggering
      autoValidatedRef.current.add(workspace.id);

      // Trigger validation
      validateWorkspace(workspace.id);
    }
  }, [workspacesData, workspacesLoading]);

  // Helper to render validation status icon
  const renderValidationIcon = (status: "pending" | "success" | "error" | undefined) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const spns = spnsData || [];
  const workspaces = workspacesData || [];
  const manualMetastores = metastoresData || [];

  // Combine manual metastores and workspace-derived metastores
  // Manual metastores take priority (shown first), then workspace-derived ones
  // Deduplicate by globalMetastoreId
  const combinedMetastores: CombinedMetastore[] = (() => {
    const seen = new Set<string>();
    const result: CombinedMetastore[] = [];

    // First add manual metastores
    for (const m of manualMetastores) {
      if (!seen.has(m.globalMetastoreId)) {
        seen.add(m.globalMetastoreId);
        result.push({
          id: m.id,
          globalMetastoreId: m.globalMetastoreId,
          name: m.name,
          sharingOrganizationName: m.sharingOrganizationName,
          scope: m.scope,
          source: "manual",
        });
      }
    }

    // Then add workspace-derived metastores (if not already present)
    for (const w of workspaces) {
      if (w.deltaSharingGlobalMetastoreId && !seen.has(w.deltaSharingGlobalMetastoreId)) {
        seen.add(w.deltaSharingGlobalMetastoreId);
        result.push({
          id: `ws_${w.id}`,
          globalMetastoreId: w.deltaSharingGlobalMetastoreId,
          name: w.deltaSharingOrganizationName || w.name || "Unnamed Metastore",
          sharingOrganizationName: w.deltaSharingOrganizationName,
          scope: w.deltaSharingScope,
          source: "workspace",
          workspaceUrl: w.workspaceUrl,
        });
      }
    }

    return result;
  })();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="shares" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="shares" className="gap-2">
            <Share2 className="h-4 w-4" />
            Shares
          </TabsTrigger>
          <TabsTrigger value="configurations" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurations
          </TabsTrigger>
        </TabsList>

        {/* Shares Tab */}
        <TabsContent value="shares" className="space-y-6 mt-6">
          {/* Metastores Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5 text-emerald-600" />
                    Metastores
                  </CardTitle>
                  <CardDescription>
                    Unity Catalog metastores available for sharing
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowAddMetastoreDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(workspacesLoading || metastoresLoading) ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : combinedMetastores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Database className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No metastores configured. Add a metastore manually or validate workspaces in the Configurations tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {combinedMetastores.map((metastore) => (
                    <div
                      key={metastore.id}
                      className="p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{metastore.name}</p>
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              metastore.source === "manual"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}>
                              {metastore.source === "manual" ? "Manual" : "Workspace"}
                            </span>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground truncate">
                            {metastore.globalMetastoreId}
                          </p>
                          {metastore.sharingOrganizationName && (
                            <p className="text-xs text-muted-foreground">
                              Sharing Name: {metastore.sharingOrganizationName}
                            </p>
                          )}
                          {metastore.workspaceUrl && (
                            <p className="text-xs text-muted-foreground truncate">
                              Workspace: {metastore.workspaceUrl}
                            </p>
                          )}
                          {metastore.scope && (
                            <p className="text-xs text-muted-foreground">
                              Scope: {metastore.scope}
                            </p>
                          )}
                        </div>
                        {metastore.source === "manual" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              const manualMeta = manualMetastores.find(m => m.id === metastore.id);
                              if (manualMeta) setShowDeleteMetastoreDialog(manualMeta);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shares Section - Shows providers and shares per metastore */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Share2 className="h-5 w-5 text-emerald-600" />
                    Providers & Shares
                  </CardTitle>
                  <CardDescription>
                    Data providers and shares available from each metastore
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    refetchProviders();
                    refetchCatalogs();
                  }}
                  disabled={providersFetching || catalogsFetching}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", (providersFetching || catalogsFetching) && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {providersLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : combinedMetastores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Share2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No metastores configured. Add a metastore above or validate workspaces in the Configurations tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {combinedMetastores.map((metastore) => {
                    // Find the provider result for this metastore
                    const providerResult = providersData?.results.find(
                      (r) => r.metastoreGlobalId === metastore.globalMetastoreId
                    );

                    return (
                      <div key={metastore.id} className="border rounded-lg overflow-hidden">
                        {/* Metastore Header */}
                        <div className={cn(
                          "p-3 flex items-center justify-between",
                          providerResult?.hasProvider
                            ? "bg-emerald-50 dark:bg-emerald-950/30"
                            : "bg-amber-50 dark:bg-amber-950/30"
                        )}>
                          <div className="flex items-center gap-3">
                            {providerResult?.hasProvider ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-amber-600" />
                            )}
                            <div>
                              <p className="font-medium">{metastore.name}</p>
                              <p className="text-xs font-mono text-muted-foreground">
                                {metastore.globalMetastoreId}
                              </p>
                            </div>
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-1 rounded",
                            metastore.source === "manual"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          )}>
                            {metastore.source === "manual" ? "Manual" : "Workspace"}
                          </span>
                        </div>

                        {/* Provider Status */}
                        <div className="p-3 border-t">
                          {providerResult?.error ? (
                            <div className="text-sm text-destructive">
                              <p className="font-medium">Error checking provider:</p>
                              <p className="text-xs">{providerResult.error}</p>
                            </div>
                          ) : !providerResult?.hasProvider ? (
                            <div className="text-sm text-amber-700 dark:text-amber-400">
                              <p className="font-medium flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                No provider found
                              </p>
                              <p className="text-xs mt-1 text-muted-foreground">
                                To enable sharing, create a provider and share in your Databricks workspace
                                using this metastore&apos;s global ID, then add a recipient for this organization.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Provider Info */}
                              <div className="text-sm">
                                <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Provider: {providerResult.provider?.name}
                                </p>
                                {providerResult.provider?.comment && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {providerResult.provider.comment}
                                  </p>
                                )}
                              </div>

                              {/* Shares List */}
                              {providerResult.shares.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                  No shares available from this provider yet.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Available Shares ({providerResult.shares.length})
                                  </p>
                                  <div className="grid gap-2">
                                    {providerResult.shares.map((share) => {
                                      const shareCatalogs = providerResult.provider
                                        ? getCatalogsForShare(providerResult.provider.name, share.name)
                                        : [];

                                      // Generate catalog name for mounting (uses organization name from better-auth)
                                      const generatedCatalogName = generateCatalogName(share.name);

                                      // Check if this share is being mounted
                                      const mountingCatalogName = providerResult.provider
                                        ? isMountingCatalog(providerResult.provider.name, share.name)
                                        : null;

                                      return (
                                        <div
                                          key={share.name}
                                          className="p-2 rounded bg-muted/50"
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Share2 className="h-4 w-4 text-muted-foreground" />
                                              <span className="text-sm font-medium">{share.name}</span>
                                            </div>
                                            {providerResult.provider && (
                                              <ShareDetailsButton
                                                providerName={providerResult.provider.name}
                                                shareName={share.name}
                                              />
                                            )}
                                          </div>

                                          {/* Catalog status section */}
                                          <div className="mt-2 pl-6 border-l-2 border-muted-foreground/20">
                                            {/* Loading catalogs */}
                                            {catalogsLoading && !mountingCatalogName && (
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Loading catalogs...
                                              </div>
                                            )}

                                            {/* Currently mounting */}
                                            {mountingCatalogName && (
                                              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>
                                                  Creating catalog <span className="font-mono font-medium">{mountingCatalogName}</span>...
                                                </span>
                                              </div>
                                            )}

                                            {/* Catalogs exist - show mounted status */}
                                            {!catalogsLoading && !mountingCatalogName && shareCatalogs.length > 0 && (
                                              <div className="space-y-1">
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                  <CheckCircle2 className="h-3 w-3" />
                                                  Mounted as:
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                  {shareCatalogs.map((cat) => (
                                                    <div
                                                      key={cat.id}
                                                      className="flex items-center gap-1"
                                                    >
                                                      <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded font-mono">
                                                        {cat.catalogName}
                                                      </span>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 w-5 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => setShowUnmountCatalogDialog(cat)}
                                                        title="Unmount catalog"
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </Button>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* No catalogs - show mount button */}
                                            {!catalogsLoading && !mountingCatalogName && shareCatalogs.length === 0 && (
                                              <div className="flex items-center gap-3">
                                                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                  <AlertTriangle className="h-3 w-3" />
                                                  Not mounted
                                                </span>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-6 text-xs"
                                                  onClick={() =>
                                                    providerResult.provider &&
                                                    handleMountCatalog(
                                                      providerResult.provider.name,
                                                      share.name,
                                                      generatedCatalogName
                                                    )
                                                  }
                                                >
                                                  <Plus className="h-3 w-3 mr-1" />
                                                  Mount as <span className="font-mono ml-1">{generatedCatalogName}</span>
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configurations Tab */}
        <TabsContent value="configurations" className="space-y-6 mt-6">
          {/* Service Principals */}
          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-emerald-600" />
                Service Principals
              </CardTitle>
              <CardDescription>
                Configure service principals for authentication (required)
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAddSpnDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {spnsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : spns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <KeyRound className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No service principals configured
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {spns.map((spn) => (
                <div
                  key={spn.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{spn.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {spn.clientId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Secret: {spn.clientSecret}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteSpnDialog(spn)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workspaces */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-emerald-600" />
                Workspaces
              </CardTitle>
              <CardDescription>
                Workspace URLs mapped to service principals
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddWorkspaceDialog(true)}
              disabled={spns.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {workspacesLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : spns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Globe className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Add a service principal first before adding workspaces
              </p>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Globe className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No workspaces configured
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => {
                const validation = validationStatus[workspace.id];
                const isLoading = validation === "loading";
                const validationResult = typeof validation === "object" ? validation : null;

                return (
                  <div
                    key={workspace.id}
                    className="p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        {workspace.name && (
                          <p className="font-medium">{workspace.name}</p>
                        )}
                        <p className={cn("text-sm font-mono truncate", !workspace.name && "font-medium")}>
                          {workspace.workspaceUrl}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SPN: {workspace.spnName} ({workspace.spnClientId})
                        </p>
                        {/* Show Delta Sharing info if available */}
                        {(() => {
                          const metastoreId = validationResult?.deltaSharingFields.deltaSharingGlobalMetastoreId || workspace.deltaSharingGlobalMetastoreId;
                          const sharingName = validationResult?.deltaSharingFields.deltaSharingOrganizationName || workspace.deltaSharingOrganizationName;
                          const hasBeenValidated = validationResult !== null || workspace.deltaSharingGlobalMetastoreId !== null;

                          if (metastoreId || sharingName) {
                            return (
                              <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                                {metastoreId && <p>Metastore: {metastoreId}</p>}
                                {sharingName && <p>Sharing Name: {sharingName}</p>}
                              </div>
                            );
                          } else if (!hasBeenValidated && !isLoading) {
                            return (
                              <p className="text-xs text-amber-600 dark:text-amber-500">
                                Click refresh to validate workspace
                              </p>
                            );
                          }
                          return null;
                        })()}

                        {/* Validation status */}
                        <div className="flex items-center gap-4 pt-2">
                          {isLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Validating...</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5" title={validationResult?.validation.workspaceAccess.message || "Workspace Access"}>
                                {renderValidationIcon(validationResult?.validation.workspaceAccess.status)}
                                <span className="text-xs text-muted-foreground">Access</span>
                              </div>
                              <div className="flex items-center gap-1.5" title={validationResult?.validation.metastoreId.message || "Metastore ID"}>
                                {renderValidationIcon(validationResult?.validation.metastoreId.status)}
                                <span className="text-xs text-muted-foreground">Metastore</span>
                              </div>
                              <div className="flex items-center gap-1.5" title={validationResult?.validation.externalSharingEnabled.message || "External Sharing"}>
                                {renderValidationIcon(validationResult?.validation.externalSharingEnabled.status)}
                                <span className="text-xs text-muted-foreground">Sharing</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => validateWorkspace(workspace.id)}
                          disabled={isLoading}
                          title="Validate workspace"
                        >
                          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setShowDeleteWorkspaceDialog(workspace)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Add SPN Dialog */}
      <Dialog open={showAddSpnDialog} onOpenChange={setShowAddSpnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service Principal</DialogTitle>
            <DialogDescription>
              Add a Databricks service principal for authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="spn-name">Name</Label>
              <Input
                id="spn-name"
                placeholder="My Service Principal"
                value={newSpnName}
                onChange={(e) => setNewSpnName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spn-client-id">Client ID</Label>
              <Input
                id="spn-client-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={newSpnClientId}
                onChange={(e) => setNewSpnClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spn-client-secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="spn-client-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter client secret"
                  value={newSpnClientSecret}
                  onChange={(e) => setNewSpnClientSecret(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddSpnDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createSpnMutation.mutate({
                  name: newSpnName,
                  clientId: newSpnClientId,
                  clientSecret: newSpnClientSecret,
                })
              }
              disabled={
                !newSpnName ||
                !newSpnClientId ||
                !newSpnClientSecret ||
                createSpnMutation.isPending
              }
            >
              {createSpnMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete SPN Dialog */}
      <Dialog
        open={!!showDeleteSpnDialog}
        onOpenChange={() => setShowDeleteSpnDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Principal</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{showDeleteSpnDialog?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteSpnDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showDeleteSpnDialog &&
                deleteSpnMutation.mutate(showDeleteSpnDialog.id)
              }
              disabled={deleteSpnMutation.isPending}
            >
              {deleteSpnMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Workspace Dialog */}
      <Dialog open={showAddWorkspaceDialog} onOpenChange={setShowAddWorkspaceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workspace</DialogTitle>
            <DialogDescription>
              Map a Databricks workspace URL to a service principal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Name (optional)</Label>
              <Input
                id="workspace-name"
                placeholder="Production Workspace"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-url">Workspace URL</Label>
              <Input
                id="workspace-url"
                placeholder="https://adb-1234567890123456.7.azuredatabricks.net"
                value={newWorkspaceUrl}
                onChange={(e) => setNewWorkspaceUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-spn">Service Principal</Label>
              <Select
                value={newWorkspaceSpnId}
                onValueChange={setNewWorkspaceSpnId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a service principal" />
                </SelectTrigger>
                <SelectContent>
                  {spns.map((spn) => (
                    <SelectItem key={spn.id} value={spn.id}>
                      <div className="flex flex-col">
                        <span>{spn.name}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {spn.clientId}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddWorkspaceDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createWorkspaceMutation.mutate({
                  name: newWorkspaceName || undefined,
                  workspaceUrl: newWorkspaceUrl,
                  spnId: newWorkspaceSpnId,
                })
              }
              disabled={
                !newWorkspaceUrl ||
                !newWorkspaceSpnId ||
                createWorkspaceMutation.isPending
              }
            >
              {createWorkspaceMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Dialog */}
      <Dialog
        open={!!showDeleteWorkspaceDialog}
        onOpenChange={() => setShowDeleteWorkspaceDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the workspace &quot;
              {showDeleteWorkspaceDialog?.name || showDeleteWorkspaceDialog?.workspaceUrl}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteWorkspaceDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showDeleteWorkspaceDialog &&
                deleteWorkspaceMutation.mutate(showDeleteWorkspaceDialog.id)
              }
              disabled={deleteWorkspaceMutation.isPending}
            >
              {deleteWorkspaceMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Metastore Dialog */}
      <Dialog open={showAddMetastoreDialog} onOpenChange={setShowAddMetastoreDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Metastore</DialogTitle>
            <DialogDescription>
              Manually add a Unity Catalog metastore for Delta Sharing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="metastore-name">Name</Label>
              <Input
                id="metastore-name"
                placeholder="Production Metastore"
                value={newMetastoreName}
                onChange={(e) => setNewMetastoreName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metastore-global-id">Global Metastore ID</Label>
              <Input
                id="metastore-global-id"
                placeholder="aws:us-west-2:abc123-def456-..."
                value={newMetastoreGlobalId}
                onChange={(e) => setNewMetastoreGlobalId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metastore-sharing-name">Sharing Organization Name (optional)</Label>
              <Input
                id="metastore-sharing-name"
                placeholder="my-organization"
                value={newMetastoreSharingName}
                onChange={(e) => setNewMetastoreSharingName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metastore-scope">Scope (optional)</Label>
              <Select
                value={newMetastoreScope}
                onValueChange={setNewMetastoreScope}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERNAL">INTERNAL</SelectItem>
                  <SelectItem value="INTERNAL_AND_EXTERNAL">INTERNAL_AND_EXTERNAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddMetastoreDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createMetastoreMutation.mutate({
                  name: newMetastoreName,
                  globalMetastoreId: newMetastoreGlobalId,
                  sharingOrganizationName: newMetastoreSharingName || undefined,
                  scope: newMetastoreScope || undefined,
                })
              }
              disabled={
                !newMetastoreName ||
                !newMetastoreGlobalId ||
                createMetastoreMutation.isPending
              }
            >
              {createMetastoreMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Metastore Dialog */}
      <Dialog
        open={!!showDeleteMetastoreDialog}
        onOpenChange={() => setShowDeleteMetastoreDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Metastore</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the metastore &quot;
              {showDeleteMetastoreDialog?.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteMetastoreDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showDeleteMetastoreDialog &&
                deleteMetastoreMutation.mutate(showDeleteMetastoreDialog.id)
              }
              disabled={deleteMetastoreMutation.isPending}
            >
              {deleteMetastoreMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unmount Catalog Dialog */}
      <Dialog
        open={!!showUnmountCatalogDialog}
        onOpenChange={() => setShowUnmountCatalogDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Unmount Catalog</DialogTitle>
            <DialogDescription>
              Are you sure you want to unmount the catalog &quot;
              <span className="font-mono font-medium">{showUnmountCatalogDialog?.catalogName}</span>
              &quot;? This will delete the catalog from your Databricks workspace.
              <br /><br />
              <span className="text-amber-600 dark:text-amber-500 font-medium">
                Warning: This action cannot be undone. Any tables, schemas, or other objects
                in this catalog will become inaccessible.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnmountCatalogDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showUnmountCatalogDialog &&
                unmountCatalogMutation.mutate({ catalogName: showUnmountCatalogDialog.catalogName })
              }
              disabled={unmountCatalogMutation.isPending}
            >
              {unmountCatalogMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Unmount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComingSoonConfig({ platform }: { platform: DataPlatform }) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-4", platform.bgColor)}>
            <Image
              src={platform.logo}
              alt={platform.name}
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">{platform.name} Integration</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {platform.name} integration is coming soon. Stay tuned for updates.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BringMyOwnDataPage() {
  const [selectedPlatform, setSelectedPlatform] = useQueryState("source", parseAsString);

  const platform = dataPlatforms.find(p => p.id === selectedPlatform);

  if (selectedPlatform && platform) {
    return (
      <div className="p-8">
        <div className="max-w-4xl space-y-6">
          {/* Back button and header */}
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPlatform(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to platforms
            </Button>
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", platform.bgColor)}>
                <Image
                  src={platform.logo}
                  alt={platform.name}
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{platform.name}</h1>
                <p className="text-muted-foreground">{platform.description}</p>
              </div>
            </div>
          </div>

          {/* Platform-specific config */}
          {selectedPlatform === "databricks" ? (
            <DatabricksConfig />
          ) : (
            <ComingSoonConfig platform={platform} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Bring My Own Data</h1>
          <p className="text-muted-foreground">
            Connect your data platform to enable data access for your organization.
          </p>
        </div>

        {/* Platform Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {dataPlatforms.map((platform) => (
            <Card
              key={platform.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700",
                selectedPlatform === platform.id && "border-emerald-500"
              )}
              onClick={() => setSelectedPlatform(platform.id)}
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center gap-3">
                  <div className={cn("w-14 h-14 rounded-lg flex items-center justify-center", platform.bgColor)}>
                    <Image
                      src={platform.logo}
                      alt={platform.name}
                      width={36}
                      height={36}
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">{platform.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {platform.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
