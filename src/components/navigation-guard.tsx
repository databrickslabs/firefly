"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface NavigationGuardProps {
  isDirty: boolean;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
  children: React.ReactNode;
}

/**
 * Component that intercepts navigation when there are unsaved changes.
 * Shows a dialog with options to save, discard, or cancel navigation.
 */
export function NavigationGuard({
  isDirty,
  onSave,
  isSaving = false,
  children,
}: NavigationGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showDialog, setShowDialog] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<string | null>(null);

  // Track the original push function
  const originalPush = React.useRef(router.push);

  // Intercept navigation
  React.useEffect(() => {
    // Store the original push function
    originalPush.current = router.push;

    // Create a navigation guard
    const handleRouteChange = (url: string) => {
      // Don't guard navigation to the same page
      if (url === pathname) return true;

      if (isDirty) {
        setPendingNavigation(url);
        setShowDialog(true);
        return false;
      }
      return true;
    };

    // Override router.push to intercept navigation
    // Note: This is a workaround since Next.js App Router doesn't have route change events
    const guardedPush = (...args: Parameters<typeof router.push>) => {
      const [href] = args;
      const url = typeof href === 'string' ? href : String(href);
      if (handleRouteChange(url)) {
        return originalPush.current(...args);
      }
      return Promise.resolve();
    };

    // Replace router.push with our guarded version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (router as any).push = guardedPush;

    // Cleanup
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router as any).push = originalPush.current;
    };
  }, [isDirty, pathname, router]);

  const handleDiscard = () => {
    setShowDialog(false);
    if (pendingNavigation) {
      // Use the original push to bypass the guard
      originalPush.current(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleSave = async () => {
    if (onSave) {
      try {
        await onSave();
        setShowDialog(false);
        if (pendingNavigation) {
          originalPush.current(pendingNavigation);
          setPendingNavigation(null);
        }
      } catch {
        // Keep dialog open on save error
      }
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingNavigation(null);
  };

  return (
    <>
      {children}

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDiscard}
              disabled={isSaving}
            >
              Discard Changes
            </Button>
            {onSave && (
              <AlertDialogAction onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
