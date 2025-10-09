"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  validateWorkspaceUrl,
  generateSlug,
} from "@/lib/admin-utils";
import { Building2, Globe, Tag, AlertCircle, CheckCircle } from "lucide-react";

interface OrganizationFormProps {
  onSuccess?: () => void;
}

export function OrganizationForm({ onSuccess }: OrganizationFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [logo, setLogo] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Auto-generate slug from name
  useEffect(() => {
    if (autoSlug && name) {
      setSlug(generateSlug(name));
    }
  }, [name, autoSlug]);

  // Validate workspace URL on change
  useEffect(() => {
    if (workspaceUrl) {
      const validation = validateWorkspaceUrl(workspaceUrl);
      setUrlError(validation.isValid ? null : validation.error || null);
    } else {
      setUrlError(null);
    }
  }, [workspaceUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Validate workspace URL
      const validation = validateWorkspaceUrl(workspaceUrl);
      if (!validation.isValid) {
        throw new Error(validation.error || "Invalid workspace URL");
      }

      // Create organization using admin API (to trigger cache revalidation)
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          workspaceUrl: validation.normalizedUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create organization");
      }

      const result = await response.json();
      console.log("Organization creation result:", result);

      setSuccess(true);
      setName("");
      setSlug("");
      setWorkspaceUrl("");
      setLogo("");
      setAutoSlug(true);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Error creating organization:", err);
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border-2 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Create Organization</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Field */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Organization Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Acme Corporation"
            required
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Slug Field */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Slug *
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setAutoSlug(false);
            }}
            placeholder="e.g., acme-corporation"
            required
            pattern="[a-z0-9-]+"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lowercase letters, numbers, and hyphens only
          </p>
        </div>

        {/* Workspace URL Field */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Databricks Workspace URL *
          </label>
          <input
            type="url"
            value={workspaceUrl}
            onChange={(e) => setWorkspaceUrl(e.target.value)}
            placeholder="https://your-workspace.cloud.databricks.com"
            required
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
              urlError ? "border-red-500" : ""
            }`}
          />
          {urlError && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {urlError}
            </p>
          )}
          {!urlError && workspaceUrl && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Valid workspace URL
            </p>
          )}
        </div>

        {/* Logo URL Field (Optional) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Logo URL (Optional)
          </label>
          <input
            type="url"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-800 rounded-md">
            <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Organization created successfully!
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={loading || !!urlError}
          className="w-full"
        >
          {loading ? "Creating..." : "Create Organization"}
        </Button>
      </form>
    </div>
  );
}
