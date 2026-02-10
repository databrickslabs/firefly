"use client";

import { useEffect, useState } from "react";
import { Building2, Users, UserPlus, UserX } from "lucide-react";
import Link from "next/link";

interface Stat {
  label: string;
  value: number;
  icon: typeof Building2;
  href: string;
}

export default function SsoSpnAdminPage() {
  const [stats, setStats] = useState<Stat[]>([
    { label: "Organizations", value: 0, icon: Building2, href: "/sso-spn-admin/organizations" },
    { label: "Orphaned Users", value: 0, icon: UserX, href: "/sso-spn-admin/orphaned-users" },
    { label: "Total Users", value: 0, icon: Users, href: "/sso-spn-admin/users" },
  ]);
  const [loading, setLoading] = useState(true);
  const [verifyingToken, setVerifyingToken] = useState(true);

  // Verify SPN admin token on mount
  useEffect(() => {
    async function verifyAdminToken() {
      try {
        const response = await fetch("/api/sso-spn-admin/verify-token");
        const data = await response.json();

        if (!data.valid) {
          console.log("SPN admin token invalid:", data.error);
        }

        setVerifyingToken(false);
      } catch (error) {
        console.error("Error verifying SPN admin token:", error);
        setVerifyingToken(false);
      }
    }

    verifyAdminToken();
  }, []);

  useEffect(() => {
    if (verifyingToken) return;

    async function fetchStats() {
      try {
        const [orgsRes, orphanedRes] = await Promise.all([
          fetch("/api/admin/organizations"),
          fetch("/api/admin/orphaned-users"),
        ]);

        if (orgsRes.ok && orphanedRes.ok) {
          const orgs = await orgsRes.json();
          const orphaned = await orphanedRes.json();

          const userIds = new Set<string>();
          orgs.forEach((org: { members?: Array<{ userId: string }> }) => {
            org.members?.forEach((member: { userId: string }) => {
              userIds.add(member.userId);
            });
          });

          setStats([
            { label: "Organizations", value: orgs.length, icon: Building2, href: "/sso-spn-admin/organizations" },
            { label: "Orphaned Users", value: orphaned.length, icon: UserX, href: "/sso-spn-admin/orphaned-users" },
            { label: "Total Users", value: userIds.size + orphaned.length, icon: Users, href: "/sso-spn-admin/users" },
          ]);
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [verifyingToken]);

  if (verifyingToken) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Verifying SPN admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Welcome Section */}
      <div>
        <h2 className="text-3xl font-bold">SPN Admin Overview</h2>
        <p className="text-muted-foreground mt-2">
          Manage service principal operations at the Databricks account level
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="block p-6 border-2 rounded-xl bg-white dark:bg-slate-900 hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="h-8 w-8 text-muted-foreground" />
                {loading ? (
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
                ) : (
                  <span className="text-3xl font-bold">{stat.value}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/sso-spn-admin/organizations"
            className="p-4 border rounded-lg bg-white dark:bg-slate-900 hover:border-primary transition-colors flex items-center gap-3"
          >
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Manage Organizations</p>
              <p className="text-sm text-muted-foreground">Create and view all organizations</p>
            </div>
          </Link>
          <Link
            href="/sso-spn-admin/invite"
            className="p-4 border rounded-lg bg-white dark:bg-slate-900 hover:border-primary transition-colors flex items-center gap-3"
          >
            <UserPlus className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Invite Users</p>
              <p className="text-sm text-muted-foreground">Send invitations to join organizations</p>
            </div>
          </Link>
          <Link
            href="/sso-spn-admin/orphaned-users"
            className="p-4 border rounded-lg bg-white dark:bg-slate-900 hover:border-primary transition-colors flex items-center gap-3"
          >
            <UserX className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="font-medium">Orphaned Users</p>
              <p className="text-sm text-muted-foreground">Assign users without organizations</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
