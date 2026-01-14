"use client";

import { useQuery } from "@tanstack/react-query";
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
import { JWTPayload } from "jose";

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
      <DialogContent className="max-w-2xl max-h-[90vh]">
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
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
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
