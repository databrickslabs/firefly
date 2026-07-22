"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GuestLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<
    "checking" | "auto-login" | "form" | "logging-in" | "error"
  >("checking");
  const [error, setError] = useState<string | null>(null);

  // Form state for manual login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // True when the user arrived via a login link (token or email/p params), so an error
  // shows a clear "link problem" screen instead of a manual form they can't complete.
  const [attemptedLink, setAttemptedLink] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const paramEmail = searchParams.get("email");
    const paramPassword = searchParams.get("p");

    if (token) {
      // One-time token login (preferred, secure)
      setAttemptedLink(true);
      setStatus("auto-login");
      verifyOneTimeToken(token);
    } else if (paramEmail && paramPassword) {
      // Legacy: email/password login
      setAttemptedLink(true);
      setStatus("auto-login");
      doEmailLogin(
        decodeURIComponent(paramEmail),
        decodeURIComponent(paramPassword)
      );
    } else {
      // No params — show manual form
      setStatus("form");
    }
  }, [searchParams]);

  async function redirectToDashboard() {
    // Get session to find the guest's org for direct dashboard access
    try {
      const session = await authClient.getSession();
      const orgId = session.data?.session?.activeOrganizationId;
      if (orgId) {
        router.push(`/sso-spn/${orgId}/dashboard`);
      } else {
        router.push("/sso-spn");
      }
    } catch {
      router.push("/sso-spn");
    }
  }

  async function verifyOneTimeToken(token: string) {
    try {
      const result = await authClient.oneTimeToken.verify({
        token,
      });

      if (result.error) {
        setStatus("error");
        setError(result.error.message || "Token verification failed");
      } else {
        await redirectToDashboard();
      }
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Token verification failed"
      );
    }
  }

  async function doEmailLogin(loginEmail: string, loginPassword: string) {
    try {
      const result = await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword,
      });

      if (result.error) {
        setStatus("error");
        setError(result.error.message || "Login failed");
      } else {
        await redirectToDashboard();
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  function handleManualLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setStatus("logging-in");
    doEmailLogin(email, password);
  }

  // Auto-login states
  if (status === "checking" || status === "auto-login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Signing you in...</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Please wait while we set up your session.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A shared login link failed — show a clear message instead of a manual email/password
  // form the guest has no credentials for. "Invalid token" = the one-time link was already
  // used (opened/refreshed twice) or never existed; "expired" = older than its 10-min TTL.
  if (status === "error" && attemptedLink) {
    const expired = /expire/i.test(error || "");
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">This login link can’t be used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-muted-foreground">
              {expired
                ? "This guest login link has expired."
                : "This guest login link is invalid or has already been used."}
            </p>
            <p className="text-sm text-muted-foreground">
              Guest login links are <strong>single-use</strong> and expire{" "}
              <strong>10 minutes</strong> after they’re created — opening one twice (a
              refresh or back navigation counts) also invalidates it. Please ask whoever
              shared it to send you a fresh link.
            </p>
            {error && (
              <p className="text-xs text-muted-foreground/70">Details: {error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Manual login form (shown when no URL params, or a manual-form submit failed)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Guest Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guest_abc@firefly-guest.local"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your guest password"
                required
              />
            </div>

            {(status === "error") && error && (
              <p className="text-destructive text-sm">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={status === "logging-in" || !email || !password}
            >
              {status === "logging-in" ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuestLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <GuestLoginContent />
    </Suspense>
  );
}
