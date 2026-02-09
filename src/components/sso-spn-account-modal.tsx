"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JWTPayload } from "jose";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";

interface DecodedTokenInfo {
  raw: string;
  decoded: JWTPayload;
}

interface AccountInfoResponse {
  provider: string;
  userEmail: string;
  clientId: string;
  clientSecretPreview: string;
  oktaToken: DecodedTokenInfo | null;
  workspaceToken: DecodedTokenInfo | null;
  organizationName: string;
  workspaceUrl: string;
}

interface WorkspaceSecretsStatusResponse {
  configured: boolean;
  scopeName: string | null;
  scopeExists: boolean;
  secretKey: string | null;
  secretRegistered: boolean;
  lastUpdated: number | null;
  patSecretKey: string | null;
  patRegistered: boolean;
  patLastUpdated: number | null;
  workspaceUrl: string;
  error?: string;
}

interface WorkspaceSecretsSetupResponse {
  scopeName: string;
  scopeExists: boolean;
  scopeCreated: boolean;
  secretKey: string;
  secretExists: boolean;
  secretUpdated: boolean;
  patSecretKey: string;
  patCreated: boolean;
  patRotated: boolean;
  workspaceUrl: string;
  error?: string;
}

interface SsoSpnAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-mono break-all">{value}</span>
    </div>
  );
}

function TokenTab({ token, title }: { token: DecodedTokenInfo | null; title: string }) {
  if (!token) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No {title.toLowerCase()} available</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="decoded" className="w-full">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="decoded">Decoded JWT</TabsTrigger>
        <TabsTrigger value="raw">Raw Token</TabsTrigger>
      </TabsList>
      <TabsContent value="decoded" className="mt-4">
        <ScrollArea className="h-[300px] rounded-md border p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(token.decoded, null, 2)}
          </pre>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        <ScrollArea className="h-[300px] rounded-md border p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {token.raw}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function StatusIcon({ status }: { status: "success" | "error" | "warning" | "pending" }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "error":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "warning":
      return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    case "pending":
      return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function SecretsTab({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();

  const { data: statusData, isLoading: statusLoading, error: statusError, refetch } = useQuery<{ data: WorkspaceSecretsStatusResponse }>({
    queryKey: ["workspace-secrets-status"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/workspace-secrets/status");
      if (!response.ok) {
        throw new Error("Failed to fetch secrets status");
      }
      return response.json();
    },
    enabled,
    staleTime: 0,
  });

  const setupMutation = useMutation<{ data: WorkspaceSecretsSetupResponse }>({
    mutationFn: async () => {
      const response = await fetch("/api/sso-spn/workspace-secrets/setup", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to setup secrets");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-secrets-status"] });
    },
  });

  const status = statusData?.data;

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Spinner className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Checking secrets status...</p>
        </div>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>Failed to load secrets status</p>
        <p className="text-xs text-muted-foreground mt-1">
          {statusError instanceof Error ? statusError.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No status data available</p>
      </div>
    );
  }

  const isFullyConfigured = status.configured && status.scopeExists && status.secretRegistered;

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-4 pr-4">
        {/* Overall Status */}
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
          <StatusIcon status={isFullyConfigured ? "success" : status.error ? "error" : "warning"} />
          <div className="flex-1">
            <p className="font-medium">
              {isFullyConfigured
                ? "Workspace Secret Registered"
                : status.error
                  ? "Configuration Error"
                  : "Secret Not Registered"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isFullyConfigured
                ? "Your SPN secret is available in the workspace"
                : status.error
                  ? status.error
                  : "Click the button below to register your secret"}
            </p>
          </div>
        </div>

        {/* Status Details */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Configuration Details</h4>

          <div className="flex items-center gap-2 py-2 border-b border-border">
            <StatusIcon status={status.configured ? "success" : "error"} />
            <span className="text-sm flex-1">Environment Configured</span>
            <Badge variant={status.configured ? "default" : "destructive"}>
              {status.configured ? "Yes" : "No"}
            </Badge>
          </div>

          {status.scopeName && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">Scope Name</span>
              <span className="text-sm font-mono">{status.scopeName}</span>
            </div>
          )}

          <div className="flex items-center gap-2 py-2 border-b border-border">
            <StatusIcon status={status.scopeExists ? "success" : "pending"} />
            <span className="text-sm flex-1">Scope Exists in Workspace</span>
            <Badge variant={status.scopeExists ? "default" : "secondary"}>
              {status.scopeExists ? "Yes" : "No"}
            </Badge>
          </div>

          {status.secretKey && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">Secret Key (Client ID)</span>
              <span className="text-sm font-mono">{status.secretKey}</span>
            </div>
          )}

          <div className="flex items-center gap-2 py-2 border-b border-border">
            <StatusIcon status={status.secretRegistered ? "success" : "pending"} />
            <span className="text-sm flex-1">Secret Registered</span>
            <Badge variant={status.secretRegistered ? "default" : "secondary"}>
              {status.secretRegistered ? "Yes" : "No"}
            </Badge>
          </div>

          {status.lastUpdated && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">Secret Last Updated</span>
              <span className="text-sm">
                {new Date(status.lastUpdated).toLocaleString()}
              </span>
            </div>
          )}

          {/* PAT Token Status */}
          {status.patSecretKey && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">PAT Secret Key</span>
              <span className="text-sm font-mono">{status.patSecretKey}</span>
            </div>
          )}

          <div className="flex items-center gap-2 py-2 border-b border-border">
            <StatusIcon status={status.patRegistered ? "success" : "pending"} />
            <span className="text-sm flex-1">PAT Token Registered</span>
            <Badge variant={status.patRegistered ? "default" : "secondary"}>
              {status.patRegistered ? "Yes" : "No"}
            </Badge>
          </div>

          {status.patLastUpdated && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">PAT Last Updated</span>
              <span className="text-sm">
                {new Date(status.patLastUpdated).toLocaleString()}
              </span>
            </div>
          )}

          {status.workspaceUrl && (
            <div className="flex flex-col gap-1 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground font-medium">Workspace URL</span>
              <span className="text-sm font-mono">{status.workspaceUrl}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending}
            className="flex-1"
          >
            {setupMutation.isPending ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Setting up...
              </>
            ) : isFullyConfigured ? (
              "Refresh Secret"
            ) : (
              "Setup Secret"
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={statusLoading}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {setupMutation.isSuccess && (
          <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm">
            Secret setup completed successfully!
            {setupMutation.data?.data?.scopeCreated && " (Scope was created)"}
            {setupMutation.data?.data?.secretUpdated && " (Secret was updated)"}
            {setupMutation.data?.data?.patCreated && " (PAT token created)"}
            {setupMutation.data?.data?.patRotated && " (PAT token rotated)"}
          </div>
        )}

        {setupMutation.isError && (
          <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
            {setupMutation.error instanceof Error ? setupMutation.error.message : "Setup failed"}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export function SsoSpnAccountModal({ open, onOpenChange }: SsoSpnAccountModalProps) {
  const { data, isLoading, error } = useQuery<{ data: AccountInfoResponse }>({
    queryKey: ["sso-spn-account-info"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/account-info");
      if (!response.ok) {
        throw new Error("Failed to fetch account info");
      }
      return response.json();
    },
    enabled: open, // Only fetch when modal is open
    staleTime: 30000, // Cache for 30 seconds
  });

  const accountInfo = data?.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            My Account
            <Badge variant="secondary" className="text-xs">SPN Auth</Badge>
          </DialogTitle>
          <DialogDescription>
            View your account details, tokens, and SPN configuration
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Spinner className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm text-muted-foreground">Loading account info...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-600">
            <p>Failed to load account information</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {accountInfo && !isLoading && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="secrets">Secrets</TabsTrigger>
              <TabsTrigger value="okta">Okta Token</TabsTrigger>
              <TabsTrigger value="workspace">Workspace Token</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-1 pr-4">
                  <InfoRow label="Provider" value={accountInfo.provider} />
                  <InfoRow label="Email" value={accountInfo.userEmail} />
                  <InfoRow label="Organization" value={accountInfo.organizationName} />
                  <InfoRow label="Workspace URL" value={accountInfo.workspaceUrl} />
                  <InfoRow label="SPN Client ID" value={accountInfo.clientId} />
                  <InfoRow label="SPN Client Secret" value={accountInfo.clientSecretPreview} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="secrets" className="mt-4">
              <SecretsTab enabled={open} />
            </TabsContent>

            <TabsContent value="okta" className="mt-4">
              <TokenTab token={accountInfo.oktaToken} title="Okta Token" />
            </TabsContent>

            <TabsContent value="workspace" className="mt-4">
              <TokenTab token={accountInfo.workspaceToken} title="Workspace Token" />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
