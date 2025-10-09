"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { AlertCircle, CheckCircle, Mail, Building2, Shield } from "lucide-react";
import { OrganizationCombobox } from "@/components/admin/organization-combobox";

interface Organization {
  id: string;
  name: string;
  slug: string | null;
}

interface UserAssignmentFormProps {
  onSuccess?: () => void;
}

const ROLES = [
  { value: "owner", label: "Owner", description: "Full access and control" },
  { value: "admin", label: "Admin", description: "Manage members and settings" },
  { value: "member", label: "Member", description: "Standard access" },
];

export function UserAssignmentForm({ onSuccess }: UserAssignmentFormProps) {
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState("member");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        setLoadingOrgs(true);

        // Fetch organizations via admin API
        const response = await fetch("/api/admin/organizations");

        if (response.ok) {
          const data = await response.json();
          setOrganizations(data as Organization[]);
          if (data.length > 0) {
            setOrganizationId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Error fetching organizations:", err);
      } finally {
        setLoadingOrgs(false);
      }
    }

    fetchOrganizations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      if (!organizationId) {
        throw new Error("Please select an organization");
      }

      // Invite user to organization
      await authClient.organization.inviteMember({
        email,
        organizationId,
        role: role as "owner" | "admin" | "member",
      });

      setSuccess(true);
      setEmail("");
      setRole("member");

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Error inviting user:", err);
      setError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setLoading(false);
    }
  };

  if (loadingOrgs) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-400 dark:border-yellow-800 rounded-md">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          No organizations available. Please create an organization first.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Field */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            User Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            An invitation will be sent to this email
          </p>
        </div>

        {/* Organization Selector */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organization *
          </label>
          <OrganizationCombobox
            organizations={organizations}
            value={organizationId}
            onValueChange={setOrganizationId}
          />
        </div>

        {/* Role Selector */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Role *
          </label>
          <div className="space-y-2">
            {ROLES.map((roleOption) => (
              <label
                key={roleOption.value}
                className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="radio"
                  name="role"
                  value={roleOption.value}
                  checked={role === roleOption.value}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium">{roleOption.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleOption.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
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
              Invitation sent successfully!
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={loading || !organizationId}
          className="w-full"
        >
          {loading ? "Sending Invitation..." : "Invite User"}
        </Button>
      </form>
  );
}
