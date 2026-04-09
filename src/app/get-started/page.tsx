"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MarketingNav } from "@/components/marketing-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LOGIN_OPTIONS = [
  {
    id: "sso-spn",
    title: "Login With Okta",
    description: "IDP User with SPN Mapping",
    href: "/sso-spn-login",
  },
  {
    id: "federation",
    title: "Custom Federation",
    description: "Multi-tenant with your identity",
    href: "/federation",
  },
  {
    id: "databricks-idp",
    title: "Login With Databricks",
    description: "Per-workspace authentication",
    href: "/databricks-idp",
  },
  {
    id: "guest-user",
    title: "Login With Guest User",
    description: "Temporary credentials login",
    href: "/guest-login",
  },
];

const STORAGE_KEY = "firefly-last-login-option";

export default function GetStartedPage() {
  const router = useRouter();
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setLastUsedId(stored);
    setIsLoaded(true);
  }, []);

  const handleLoginClick = (optionId: string, href: string) => {
    localStorage.setItem(STORAGE_KEY, optionId);
    router.push(href);
  };

  const lastUsedOption = lastUsedId
    ? LOGIN_OPTIONS.find((opt) => opt.id === lastUsedId)
    : null;
  const otherOptions = lastUsedId
    ? LOGIN_OPTIONS.filter((opt) => opt.id !== lastUsedId)
    : LOGIN_OPTIONS;

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">
              Select Authentication Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {lastUsedOption && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Previously Used
                </h3>
                <Button
                  variant="default"
                  className="w-full h-auto py-4 px-6 justify-start"
                  onClick={() =>
                    handleLoginClick(lastUsedOption.id, lastUsedOption.href)
                  }
                >
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{lastUsedOption.title}</span>
                    <span className="text-sm font-normal opacity-80">
                      {lastUsedOption.description}
                    </span>
                  </div>
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {lastUsedOption ? "Other Login Options" : "Login Options"}
              </h3>
              <div className="space-y-2">
                {otherOptions.map((option) => (
                  <Button
                    key={option.id}
                    variant="outline"
                    className="w-full h-auto py-4 px-6 justify-start"
                    onClick={() => handleLoginClick(option.id, option.href)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">{option.title}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
