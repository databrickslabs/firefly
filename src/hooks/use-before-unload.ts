"use client";

import { useEffect, useCallback } from "react";

/**
 * Hook to show a browser confirmation dialog when the user tries to
 * close or navigate away from the page with unsaved changes.
 *
 * @param isDirty - Whether there are unsaved changes
 * @param message - The message to show in the confirmation dialog (browser may override)
 */
export function useBeforeUnload(isDirty: boolean, message: string = "You have unsaved changes. Are you sure you want to leave?") {
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!isDirty) return;

      event.preventDefault();
      // Modern browsers ignore this message but require it to be set
      event.returnValue = message;
      return message;
    },
    [isDirty, message]
  );

  useEffect(() => {
    if (isDirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, handleBeforeUnload]);
}
