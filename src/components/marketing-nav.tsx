"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const solutions: { title: string; href: string; description: string; comingSoon?: boolean }[] = [
  {
    title: "Notebooks",
    href: "/databricks-idp/notebooks",
    description:
      "Interactive notebooks with full Databricks functionality and custom UI.",
    comingSoon: true,
  },
  {
    title: "SQL Editor",
    href: "/databricks-idp/sql",
    description:
      "Query your data with an advanced SQL editor and visual query builder.",
    comingSoon: true,
  },
  {
    title: "Data Catalog",
    href: "/databricks-idp/catalog",
    description:
      "Explore your Unity Catalog with a modern, intuitive interface.",
    comingSoon: true,
  },
  {
    title: "Embedding Databricks Apps w/o SSO",
    href: "/docs/architecture/lakehouse-apps-proxy",
    description:
      "Embed Databricks apps without exposing Databricks SSO login flows to end users.",
    comingSoon: false,
  },
];

const authenticationOptions: { title: string; href: string; description: string; comingSoon?: boolean }[] = [
  {
    title: "SSO Mapped to SPN",
    href: "/sso-spn",
    description:
      "Tenant-based authentication with service principal identity mapping. Users share a common SPN per organization.",
    comingSoon: true,
  },
  {
    title: "Custom Federation",
    href: "/federation",
    description:
      "Multi-tenant authentication with your custom identity provider. Manage organizations with federated identities.",
    comingSoon: true,
  },
  {
    title: "Databricks Identity",
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
    title: "Authentication",
    description:
      "Choose from multiple authentication strategies to fit your organization's needs.",
    submenu: authenticationOptions,
  },
  {
    title: "Multi-Tenant",
    href: "#",
    description:
      "Support multiple organizations with isolated workspaces and shared infrastructure.",
    comingSoon: true,
  },
  {
    title: "Request Flow",
    href: "/docs/architecture/request-flow",
    description:
      "Understand how data flows from the frontend through APIs to Databricks and back.",
    comingSoon: false,
  },
  {
    title: "Security",
    href: "#",
    description:
      "Enterprise-grade security with OAuth, RBAC, and data encryption.",
    comingSoon: true,
  },
  {
    title: "Scalability",
    href: "#",
    description:
      "Built on Databricks for unlimited scale and performance.",
    comingSoon: true,
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
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4">
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
