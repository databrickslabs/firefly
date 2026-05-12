"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, ChevronDown, User, Settings, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { OrgSwitcher } from "@/components/org-switcher";
import { SsoSpnAccountModal } from "@/components/sso-spn-account-modal";
import { CustomizeNavModal } from "@/components/customize-nav-modal";
import { GitHubSourceLink } from "@/components/github-source-link";
import { useNavCustomization } from "@/hooks/use-nav-customization";

interface SsoSpnTopNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  title: string;
  basePath: string;
}

export function SsoSpnTopNav({ user, title, basePath }: SsoSpnTopNavProps) {
  const router = useRouter();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const orgId = basePath.split("/")[2];
  const { userMenuItems, hasLoaded: navLoaded } = useNavCustomization(orgId);

  // Fetch current user's membership role using better-auth
  useEffect(() => {
    const fetchMemberRole = async () => {
      try {
        const result = await authClient.organization.getActiveMember();
        if (result.data?.role) {
          setMemberRole(result.data.role);
        }
      } catch {
        // Silently fail - user just won't see org settings
      }
    };
    fetchMemberRole();
  }, []);

  // Check if user is owner or admin
  const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";

  // Guest users are explicitly assigned role: 'guest' at creation time
  const isGuest = user.role === "guest";

  const handleSignOut = async () => {
    await authClient.signOut();
    // Redirect to SPN login page
    router.push("/sso-spn");
  };

  return (
    <>
      {/* Left Section - Logo/Title */}
      <Link href={`${basePath}/dashboard`} className="flex items-center gap-3 flex-shrink-0 hover:opacity-80 transition-opacity">
        <Image
          src="/logo.png"
          alt="FireFly Analytics Logo"
          width={32}
          height={32}
          className="object-contain"
        />
        <h1 className="text-xl font-semibold bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
          {title}
        </h1>
      </Link>

      {/* Center Section - Search Bar */}
      <div className="flex-1 max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search data, notebooks, recents, and more..."
            className="w-full pl-10 pr-4 py-1.5 text-sm bg-muted/50 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Right Section - Org Switcher & Profile */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        {/* Organization Switcher */}
        <OrgSwitcher />
        <GitHubSourceLink />

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="h-4 w-4" />
              <span className="text-sm">{user.name || user.email}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuItem>
            {(() => {
              const showAccountDetails = !isGuest && (!navLoaded || userMenuItems["Account Details"] !== false);
              const showProfileSettings = !isGuest && (!navLoaded || userMenuItems["Profile Settings"] !== false);
              const showPreferences = !isGuest && (!navLoaded || userMenuItems["Preferences"] !== false);
              const showOrgSettings = (isGuest || isOwnerOrAdmin) && (!navLoaded || userMenuItems["Organization Settings"] !== false);
              const hasAnyMiddleItem = showAccountDetails || showProfileSettings || showPreferences || showOrgSettings;

              return (
                <>
                  {hasAnyMiddleItem && <DropdownMenuSeparator />}
                  {showAccountDetails && (
                    <DropdownMenuItem onClick={() => setAccountModalOpen(true)}>
                      Account Details
                    </DropdownMenuItem>
                  )}
                  {showProfileSettings && (
                    <DropdownMenuItem disabled>Profile Settings</DropdownMenuItem>
                  )}
                  {showPreferences && (
                    <DropdownMenuItem disabled>Preferences</DropdownMenuItem>
                  )}
                  {showOrgSettings && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`${basePath}/settings`} className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Organization Settings
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              );
            })()}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCustomizeModalOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Customize
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-600 focus:text-red-600"
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Account Modal */}
      <SsoSpnAccountModal
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
      />

      {/* Customize Navigation Modal */}
      <CustomizeNavModal
        open={customizeModalOpen}
        onOpenChange={setCustomizeModalOpen}
        orgId={orgId}
      />
    </>
  );
}
