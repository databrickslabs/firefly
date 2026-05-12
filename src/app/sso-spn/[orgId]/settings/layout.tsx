"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { SettingsNav } from "@/components/settings-nav";
import { Spinner } from "@/components/ui/spinner";
import { Eye } from "lucide-react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const orgId = params.orgId as string;
  const basePath = `/sso-spn/${orgId}/settings`;

  const { data: session } = useSession();
  const isGuest = session?.user?.role === "guest";

  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch current user's membership role using better-auth
  useEffect(() => {
    const fetchMemberRole = async () => {
      try {
        const result = await authClient.organization.getActiveMember();
        if (result.data?.role) {
          setMemberRole(result.data.role);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchMemberRole();
  }, []);

  const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";

  // Redirect non-owner/admins (but allow guests through in read-only mode)
  useEffect(() => {
    if (!isGuest && !loading && !isOwnerOrAdmin) {
      router.push(`/sso-spn/${orgId}/dashboard`);
    }
  }, [loading, isOwnerOrAdmin, isGuest, router, orgId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!isGuest && !isOwnerOrAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-full">
      {isGuest && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            <strong>Demo view</strong> — you&apos;re browsing settings in read-only mode. Changes are disabled.
          </span>
        </div>
      )}
      <div className="flex flex-1">
        {/* Left Navigation - sticky, accounting for h-14 (3.5rem) top nav */}
        <div className="border-r bg-muted/30 py-6 sticky top-0 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <SettingsNav basePath={basePath} isGuest={isGuest} />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
