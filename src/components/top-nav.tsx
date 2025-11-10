"use client";

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
import { Search, ChevronDown, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { OrgSwitcher } from "@/components/org-switcher";

interface TopNavProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
  title: string;
  basePath: string;
}

export function TopNav({ user, title, basePath }: TopNavProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    // Redirect to main login page, not org-specific page
    router.push("/databricks-idp");
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
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Organization Switcher */}
        <OrgSwitcher />

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
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
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
    </>
  );
}
