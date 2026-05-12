"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Copy, ExternalLink, RefreshCw, Link2, Plus } from "lucide-react";

interface GuestUserResult {
  id: string;
  userId: string;
  organizationId: string;
  email: string;
  loginUrl: string;
  expiresAt: string;
  orgName: string;
  orgSlug: string;
}

interface GuestUserListItem {
  id: string;
  userId: string;
  organizationId: string;
  email: string;
  displayName: string | null;
  expiresAt: string;
  isExpired: boolean;
  isEffectivelyExpired: boolean;
  cleanedUpAt: string | null;
  createdAt: string;
  orgName: string | null;
  orgSlug: string | null;
}

interface GuestWorkspaceItem {
  id: string;
  name: string;
  workspaceUrl: string;
  createdAt: string;
}

interface GuestSpnItem {
  id: string;
  name: string;
  clientId: string;
  guestWorkspaceId: string;
  workspaceName: string | null;
  workspaceUrl: string | null;
  createdAt: string;
}

export default function GuestUsersAdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);

  // Form state
  const [name, setName] = useState("Demo User");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("Demo Organization");
  const [spnId, setSpnId] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState("60");
  const [displayNameField, setDisplayNameField] = useState("");

  // Guest workspaces/SPNs
  const [guestWorkspacesList, setGuestWorkspacesList] = useState<GuestWorkspaceItem[]>([]);
  const [guestSpnsList, setGuestSpnsList] = useState<GuestSpnItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Add workspace form
  const [newWsName, setNewWsName] = useState("");
  const [newWsUrl, setNewWsUrl] = useState("");
  const [addingWorkspace, setAddingWorkspace] = useState(false);

  // Add SPN form
  const [newSpnName, setNewSpnName] = useState("");
  const [newSpnClientId, setNewSpnClientId] = useState("");
  const [newSpnClientSecret, setNewSpnClientSecret] = useState("");
  const [newSpnWorkspaceId, setNewSpnWorkspaceId] = useState("");
  const [addingSpn, setAddingSpn] = useState(false);

  // Results
  const [creating, setCreating] = useState(false);
  const [lastCreated, setLastCreated] = useState<GuestUserResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guest list
  const [guests, setGuests] = useState<GuestUserListItem[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Regenerate login URL
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // GC
  const [runningGc, setRunningGc] = useState(false);
  const [gcResult, setGcResult] = useState<string | null>(null);

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  useEffect(() => {
    if (!apiKeySet) return;
    loadGuestResources();
    loadGuests();
  }, [apiKeySet, statusFilter]);

  async function loadGuestResources() {
    setLoadingOptions(true);
    try {
      const [wsRes, spnRes] = await Promise.all([
        fetch("/api/guest/workspaces", { headers: { "X-API-Key": apiKey } }),
        fetch("/api/guest/spns", { headers: { "X-API-Key": apiKey } }),
      ]);

      if (wsRes.ok) {
        const data = await wsRes.json();
        setGuestWorkspacesList(data.workspaces || []);
      }
      if (spnRes.ok) {
        const data = await spnRes.json();
        setGuestSpnsList(data.spns || []);
      }
    } catch (err) {
      console.error("Error loading guest resources:", err);
    } finally {
      setLoadingOptions(false);
    }
  }

  async function loadGuests() {
    setLoadingGuests(true);
    try {
      const res = await fetch(
        `/api/guest/users?status=${statusFilter}`,
        { headers: { "X-API-Key": apiKey } }
      );
      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error("Error loading guests:", err);
    } finally {
      setLoadingGuests(false);
    }
  }

  async function handleAddWorkspace() {
    if (!newWsName || !newWsUrl) return;
    setAddingWorkspace(true);
    try {
      const res = await fetch("/api/guest/workspaces", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newWsName, workspaceUrl: newWsUrl }),
      });
      if (res.ok) {
        setNewWsName("");
        setNewWsUrl("");
        loadGuestResources();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add workspace");
      }
    } catch {
      alert("Failed to add workspace");
    } finally {
      setAddingWorkspace(false);
    }
  }

  async function handleDeleteWorkspace(id: string) {
    if (!confirm("Delete this guest workspace? Its SPNs will also be deleted.")) return;
    try {
      const res = await fetch(`/api/guest/workspaces/${id}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) loadGuestResources();
    } catch {
      alert("Failed to delete workspace");
    }
  }

  async function handleAddSpn() {
    if (!newSpnName || !newSpnClientId || !newSpnClientSecret || !newSpnWorkspaceId) return;
    setAddingSpn(true);
    try {
      const res = await fetch("/api/guest/spns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newSpnName,
          clientId: newSpnClientId,
          clientSecret: newSpnClientSecret,
          guestWorkspaceId: newSpnWorkspaceId,
        }),
      });
      if (res.ok) {
        setNewSpnName("");
        setNewSpnClientId("");
        setNewSpnClientSecret("");
        setNewSpnWorkspaceId("");
        loadGuestResources();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add SPN");
      }
    } catch {
      alert("Failed to add SPN");
    } finally {
      setAddingSpn(false);
    }
  }

  async function handleDeleteSpn(id: string) {
    if (!confirm("Delete this guest SPN?")) return;
    try {
      const res = await fetch(`/api/guest/spns/${id}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) loadGuestResources();
    } catch {
      alert("Failed to delete SPN");
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setLastCreated(null);

    try {
      const res = await fetch("/api/guest/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name || undefined,
          email: email || undefined,
          orgName,
          spnId,
          expiresInMinutes: parseInt(expiresInMinutes) || 60,
          displayName: displayNameField || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create guest user");
        return;
      }

      setLastCreated(data.guestUser);
      loadGuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(guestId: string) {
    if (!confirm("Delete this guest user and their org?")) return;

    try {
      const res = await fetch(`/api/guest/users/${guestId}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });

      if (res.ok) {
        loadGuests();
      }
    } catch (err) {
      console.error("Error deleting guest:", err);
    }
  }

  async function handleRegenerate(guestId: string) {
    setRegeneratingId(guestId);
    setRegeneratedUrl(null);
    setRegenerateError(null);
    try {
      const res = await fetch(`/api/guest/users/${guestId}`, {
        method: "POST",
        headers: { "X-API-Key": apiKey },
      });
      const data = await res.json();
      if (res.ok && data.loginUrl) {
        setRegeneratedUrl(data.loginUrl);
      } else {
        setRegenerateError(data.error || "Failed to regenerate login URL");
      }
    } catch {
      setRegenerateError("Failed to regenerate login URL");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleGc() {
    setRunningGc(true);
    setGcResult(null);
    try {
      const res = await fetch("/api/guest/gc", {
        method: "POST",
        headers: { "X-API-Key": apiKey },
      });
      const data = await res.json();
      setGcResult(
        `Cleaned ${data.cleaned?.count || 0} expired guests${data.hasMore ? " (more remaining)" : ""}`
      );
      loadGuests();
    } catch {
      setGcResult("GC failed");
    } finally {
      setRunningGc(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  // API key entry screen
  if (!apiKeySet) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Guest User Admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="apiKey">API Key (GUEST_API_SECRET)</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your 64-char API key"
              />
            </div>
            <Button
              onClick={() => apiKey.length > 0 && setApiKeySet(true)}
              disabled={!apiKey}
              className="w-full"
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold">Guest User Admin</h2>

      {/* Guest Workspaces Management */}
      <Card>
        <CardHeader>
          <CardTitle>Guest Workspaces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {guestWorkspacesList.length > 0 && (
            <div className="space-y-2">
              {guestWorkspacesList.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{ws.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ws.workspaceUrl}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteWorkspace(ws.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Name</Label>
              <Input value={newWsName} onChange={(e) => setNewWsName(e.target.value)} placeholder="My Workspace" />
            </div>
            <div className="flex-1">
              <Label>Workspace URL</Label>
              <Input value={newWsUrl} onChange={(e) => setNewWsUrl(e.target.value)} placeholder="https://adb-123.azuredatabricks.net" />
            </div>
            <Button onClick={handleAddWorkspace} disabled={addingWorkspace || !newWsName || !newWsUrl} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Guest SPNs Management */}
      <Card>
        <CardHeader>
          <CardTitle>Guest SPNs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {guestSpnsList.length > 0 && (
            <div className="space-y-2">
              {guestSpnsList.map((spn) => (
                <div key={spn.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{spn.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Client: {spn.clientId.substring(0, 8)}... | Workspace: {spn.workspaceName || spn.workspaceUrl || "unknown"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteSpn(spn.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>SPN Name</Label>
                <Input value={newSpnName} onChange={(e) => setNewSpnName(e.target.value)} placeholder="Guest SPN" />
              </div>
              <div>
                <Label>Workspace</Label>
                {guestWorkspacesList.length > 0 ? (
                  <Select value={newSpnWorkspaceId} onValueChange={setNewSpnWorkspaceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {guestWorkspacesList.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">Add a workspace first</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Client ID</Label>
                <Input value={newSpnClientId} onChange={(e) => setNewSpnClientId(e.target.value)} placeholder="Client ID" />
              </div>
              <div>
                <Label>Client Secret</Label>
                <Input type="password" value={newSpnClientSecret} onChange={(e) => setNewSpnClientSecret(e.target.value)} placeholder="Client Secret" />
              </div>
            </div>
            <Button
              onClick={handleAddSpn}
              disabled={addingSpn || !newSpnName || !newSpnClientId || !newSpnClientSecret || !newSpnWorkspaceId}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" /> Add SPN
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Guest User Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create Guest User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="guestName">Name</Label>
              <Input
                id="guestName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Demo User"
              />
            </div>
            <div>
              <Label htmlFor="guestEmail">
                Email <span className="text-muted-foreground text-xs">(optional, auto-generated)</span>
              </Label>
              <Input
                id="guestEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guest_abc@firefly-guest.local"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orgNameField">Organization Name</Label>
              <Input
                id="orgNameField"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Demo Organization"
              />
            </div>
            <div>
              <Label htmlFor="displayNameField">
                Display Name <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="displayNameField"
                value={displayNameField}
                onChange={(e) => setDisplayNameField(e.target.value)}
                placeholder="Demo Corp"
              />
            </div>
          </div>

          <div>
            <Label>Guest SPN</Label>
            {loadingOptions ? (
              <p className="text-sm text-muted-foreground mt-2">Loading...</p>
            ) : guestSpnsList.length > 0 ? (
              <Select value={spnId} onValueChange={setSpnId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Guest SPN" />
                </SelectTrigger>
                <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-fit max-w-[90vw]">
                  {guestSpnsList.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="whitespace-nowrap">
                      {s.name} ({s.clientId}) - {s.workspaceName || s.workspaceUrl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Add a guest SPN above first</p>
            )}
          </div>

          <div>
            <Label htmlFor="expires">Expires In (minutes)</Label>
            <Input
              id="expires"
              type="number"
              value={expiresInMinutes}
              onChange={(e) => setExpiresInMinutes(e.target.value)}
              placeholder="60"
              className="max-w-xs"
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <Button
            onClick={handleCreate}
            disabled={creating || !orgName || !spnId}
            className="w-full"
          >
            {creating ? "Creating..." : "Create Guest User"}
          </Button>

          {/* Created result */}
          {lastCreated && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-2">
              <p className="font-semibold text-sm">Guest User Created</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono">{lastCreated.email}</span>
                <span className="text-muted-foreground">Org:</span>
                <span>{lastCreated.orgName} ({lastCreated.orgSlug})</span>
                <span className="text-muted-foreground">Expires:</span>
                <span>{new Date(lastCreated.expiresAt).toLocaleString()}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(lastCreated.loginUrl)}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy Login URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(lastCreated.loginUrl, "_blank")}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Open Login URL
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guest Users List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Guest Users</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadGuests} disabled={loadingGuests}>
                <RefreshCw className={`h-4 w-4 ${loadingGuests ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGc}
                disabled={runningGc}
              >
                {runningGc ? "Running GC..." : "Run GC"}
              </Button>
            </div>
          </div>
          {gcResult && (
            <p className="text-sm text-muted-foreground">{gcResult}</p>
          )}
        </CardHeader>
        <CardContent>
          {loadingGuests ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : guests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No guest users found.</p>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center justify-between p-3 border rounded-lg ${
                    g.isEffectivelyExpired ? "opacity-50" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-mono text-sm">{g.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Org: {g.orgName || "deleted"} | Expires:{" "}
                      {new Date(g.expiresAt).toLocaleString()}
                      {g.isEffectivelyExpired && (
                        <span className="text-destructive ml-1">
                          {g.cleanedUpAt ? "(cleaned up)" : "(expired)"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!g.isEffectivelyExpired && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Regenerate login URL (10 min)"
                        onClick={() => handleRegenerate(g.id)}
                        disabled={regeneratingId === g.id}
                      >
                        <Link2 className={`h-4 w-4 ${regeneratingId === g.id ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                    {!g.cleanedUpAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(g.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {regenerateError && (
            <div className="mt-4 p-3 border border-destructive rounded-lg bg-destructive/10">
              <p className="text-destructive text-sm font-medium">Regeneration failed</p>
              <p className="text-destructive text-xs mt-1">{regenerateError}</p>
            </div>
          )}

          {regeneratedUrl && (
            <div className="mt-4 p-3 border rounded-lg bg-muted/50 space-y-2">
              <p className="font-semibold text-sm">Regenerated Login URL (expires in 10 min)</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(regeneratedUrl)}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(regeneratedUrl, "_blank")}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Open URL
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
