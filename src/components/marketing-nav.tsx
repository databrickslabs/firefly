"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Menu } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const solutions: { title: string; href: string; description: string; comingSoon?: boolean }[] = [
  {
    title: "Notebook Editor",
    href: "/docs/solutions/notebook-editor",
    description:
      "Interactive Python notebooks powered by Marimo with full Databricks integration.",
    comingSoon: false,
  },
  {
    title: "Code Editor",
    href: "/docs/solutions/code-editor",
    description:
      "VS Code-style development environment with terminal and Git support.",
    comingSoon: false,
  },
  {
    title: "SQL Editor",
    href: "/docs/solutions/sql-editor",
    description:
      "Query your data with an advanced SQL editor and warehouse integration.",
    comingSoon: false,
  },
  {
    title: "Data Catalog",
    href: "/docs/solutions/data-catalog",
    description:
      "Explore your Unity Catalog with a modern, hierarchical interface.",
    comingSoon: false,
  },
  {
    title: "Pipeline Editor",
    href: "/docs/solutions/pipeline-editor",
    description:
      "Visual node-based pipeline design with Delta Live Tables integration.",
    comingSoon: false,
  },
  {
    title: "Embedding Databricks Apps w/o SSO",
    href: "/docs/solutions/embedding-apps",
    description:
      "Embed Databricks apps without exposing Databricks SSO login flows to end users.",
    comingSoon: false,
  },
];


const iamOnboardingOptions: { title: string; href: string; description: string; comingSoon?: boolean }[] = [
  {
    title: "Organizations",
    href: "/docs/architecture/iam/organizations",
    description:
      "Manage organizations, configure settings, and control access across your multi-tenant platform.",
    comingSoon: false,
  },
  {
    title: "Users",
    href: "/docs/architecture/iam/users",
    description:
      "Manage users, roles, and permissions. Onboard new users and configure access controls.",
    comingSoon: false,
  },
];

const authenticationOptions: { title: string; href: string; description: string; comingSoon?: boolean }[] = [
  {
    title: "Login With Okta",
    href: "/docs/architecture/authentication/sso-mapped-spn",
    description:
      "Tenant-based authentication with service principal identity mapping. Users share a common SPN per organization.",
    comingSoon: false,
  },
  {
    title: "Custom Federation",
    href: "/federation",
    description:
      "Multi-tenant authentication with your custom identity provider. Manage organizations with federated identities.",
    comingSoon: true,
  },
  {
    title: "Login With Databricks",
    href: "/docs/architecture/authentication/databricks-identity",
    description:
      "Per-workspace authentication using Databricks native OAuth. Direct integration with Databricks accounts.",
    comingSoon: false,
  },
];

const architecture: {
  title: string;
  href?: string;
  description: string;
  submenu?: { title: string; href: string; description: string; comingSoon?: boolean }[];
  comingSoon?: boolean;
}[] = [
  {
    title: "Overview",
    href: "/docs/architecture/overview",
    description:
      "SSO-SPN architecture overview - from 10,000 feet to detailed component views.",
    comingSoon: false,
  },
  {
    title: "Authentication",
    description:
      "Choose from multiple authentication strategies to fit your organization's needs.",
    submenu: authenticationOptions,
  },
  {
    title: "IAM & Onboarding",
    description:
      "Identity and access management with user onboarding workflows.",
    submenu: iamOnboardingOptions,
  },
  {
    title: "Request Flow",
    href: "/docs/architecture/request-flow",
    description:
      "Understand how SSO authentication and SPN tokens flow through the system.",
    comingSoon: false,
  },
  {
    title: "Security",
    href: "/docs/architecture/security",
    description:
      "Enterprise-grade security with OAuth, RBAC, and data encryption.",
    comingSoon: false,
  },
  {
    title: "Scalability",
    href: "/docs/architecture/scalability",
    description:
      "Built on Databricks for unlimited scale and performance.",
    comingSoon: false,
  },
];

function ArchitectureMenu({
  items
}: {
  items: {
    title: string;
    href?: string;
    description: string;
    submenu?: { title: string; href: string; description: string; comingSoon?: boolean }[];
    comingSoon?: boolean;
  }[];
}) {
  const [openPopover, setOpenPopover] = React.useState<string | null>(null);
  const [activeItem, setActiveItem] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterItem = (itemTitle: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveItem(itemTitle);
    setOpenPopover(itemTitle);
  };

  const handleMouseLeaveItem = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveItem(null);
      setOpenPopover(null);
    }, 150);
  };

  const handleMouseEnterOther = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveItem(null);
    setOpenPopover(null);
  };

  return (
    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-1 lg:w-[600px]">
      {items.map((item) => (
        <li key={item.title}>
          {item.submenu ? (
            <Popover
              open={openPopover === item.title}
              onOpenChange={(open) => {
                if (!open) {
                  setOpenPopover(null);
                  setActiveItem(null);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  onMouseEnter={() => handleMouseEnterItem(item.title)}
                  onMouseLeave={handleMouseLeaveItem}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground text-left",
                    activeItem === item.title && "bg-accent text-accent-foreground"
                  )}
                >
                  <div className="flex-1 space-y-1">
                    <div className="text-sm font-medium leading-none">
                      {item.title}
                    </div>
                    <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[500px] p-4"
                side="right"
                align="start"
                onMouseEnter={() => handleMouseEnterItem(item.title)}
                onMouseLeave={handleMouseLeaveItem}
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {item.submenu?.map((subItem) => (
                      subItem.comingSoon ? (
                        <div
                          key={subItem.title}
                          className="block rounded-md p-3 opacity-50 cursor-not-allowed"
                        >
                          <div className="flex items-center gap-2 font-medium text-sm mb-1">
                            <span className="text-muted-foreground">{subItem.title}</span>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                              Coming Soon
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {subItem.description}
                          </p>
                        </div>
                      ) : (
                        <Link
                          key={subItem.title}
                          href={subItem.href}
                          className="block rounded-md p-3 hover:bg-accent transition-colors"
                        >
                          <div className="font-medium text-sm mb-1">
                            {subItem.title}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {subItem.description}
                          </p>
                        </Link>
                      )
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : item.comingSoon ? (
            <div
              onMouseEnter={handleMouseEnterOther}
              className={cn(
                "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium leading-none">
                <span className="text-muted-foreground">{item.title}</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              </div>
              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                {item.description}
              </p>
            </div>
          ) : (
            <NavigationMenuLink asChild>
              <Link
                href={item.href || "#"}
                onMouseEnter={handleMouseEnterOther}
                className={cn(
                  "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                )}
              >
                <div className="text-sm font-medium leading-none">
                  {item.title}
                </div>
                <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </Link>
            </NavigationMenuLink>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full flex h-14 items-center px-6">
        <Link href="/" className="flex items-center gap-3 mr-8">
          <Image
            src="/logo.png"
            alt="FireFly Analytics Logo"
            width={32}
            height={32}
            className="object-contain"
          />
          <span className="text-xl font-semibold bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
            FireFly Analytics
          </span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-1 lg:w-[600px]">
                  {solutions.map((item) => (
                    <ListItem
                      key={item.title}
                      title={item.title}
                      href={item.href}
                      comingSoon={item.comingSoon}
                    >
                      {item.description}
                    </ListItem>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>Architecture</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ArchitectureMenu items={architecture} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center gap-2">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[400px] overflow-y-auto">
              <SheetHeader className="border-b pb-4">
                <SheetTitle>
                  <Link href="/" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                    <Image
                      src="/logo.png"
                      alt="FireFly Analytics Logo"
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                    <span className="text-xl font-semibold bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
                      FireFly Analytics
                    </span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-6 py-6 px-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Solutions
                  </h3>
                  {solutions.map((item) => (
                    <Link
                      key={item.title}
                      href={item.comingSoon ? "#" : item.href}
                      onClick={() => !item.comingSoon && setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between py-3 px-3 rounded-lg text-sm transition-colors",
                        item.comingSoon
                          ? "text-muted-foreground cursor-not-allowed"
                          : "hover:bg-accent"
                      )}
                    >
                      <span>{item.title}</span>
                      {item.comingSoon && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                          Soon
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Architecture
                  </h3>
                  {architecture.map((item) => (
                    <Link
                      key={item.title}
                      href={item.comingSoon ? "#" : (item.href || "#")}
                      onClick={() => !item.comingSoon && setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between py-3 px-3 rounded-lg text-sm transition-colors",
                        item.comingSoon
                          ? "text-muted-foreground cursor-not-allowed"
                          : "hover:bg-accent"
                      )}
                    >
                      <span>{item.title}</span>
                      {item.comingSoon && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                          Soon
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-6 border-t bg-background">
                <Button asChild className="w-full" size="lg" onClick={() => setMobileMenuOpen(false)}>
                  <Link href="/get-started">Get Started</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop Get Started Button */}
          <Button asChild className="hidden md:inline-flex">
            <Link href="/get-started">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ListItem({
  title,
  children,
  href,
  className,
  comingSoon,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { href: string; comingSoon?: boolean }) {
  if (comingSoon) {
    return (
      <li {...props}>
        <div
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none opacity-50 cursor-not-allowed",
            className
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium leading-none">
            <span className="text-muted-foreground">{title}</span>
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
