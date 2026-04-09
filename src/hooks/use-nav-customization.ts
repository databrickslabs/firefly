import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Identifiers for sidebar navigation items (matching `name` field in navigationItems)
 */
export type SidebarNavItemId =
  | "Home"
  | "Catalog"
  | "SQL"
  | "IDE"
  | "Embedded Dashboard"
  | "Pipelines"
  | "Import Data"
  | "Jobs (Coming Soon)"
  | "Admin";

/**
 * Identifiers for user menu items
 */
export type UserMenuItemId =
  | "Account Details"
  | "Profile Settings"
  | "Preferences"
  | "Organization Settings";

interface NavCustomizationState {
  sidebarItems: Record<string, boolean>;
  userMenuItems: Record<string, boolean>;
  timestamp: number;
}

const DEFAULT_SIDEBAR_ITEMS: Record<SidebarNavItemId, boolean> = {
  Home: true,
  Catalog: true,
  SQL: true,
  IDE: true,
  "Embedded Dashboard": true,
  Pipelines: true,
  "Import Data": true,
  "Jobs (Coming Soon)": true,
  Admin: true,
};

const DEFAULT_USER_MENU_ITEMS: Record<UserMenuItemId, boolean> = {
  "Account Details": true,
  "Profile Settings": true,
  Preferences: true,
  "Organization Settings": true,
};

const NAV_CUSTOMIZATION_EVENT = "nav-customization-changed";

/**
 * Custom hook to manage navigation customization with localStorage persistence.
 * Scoped to orgId so each organization has its own settings.
 *
 * Saving happens directly in setter functions (not via useEffect) to avoid
 * infinite loops when multiple instances of this hook exist in the component tree.
 */
export function useNavCustomization(orgId: string) {
  const storageKey = `nav-customization:${orgId}`;

  const [sidebarItems, setSidebarItems] = useState<Record<string, boolean>>({
    ...DEFAULT_SIDEBAR_ITEMS,
  });
  const [userMenuItems, setUserMenuItems] = useState<Record<string, boolean>>({
    ...DEFAULT_USER_MENU_ITEMS,
  });
  const [hasLoaded, setHasLoaded] = useState(false);

  // Refs to track latest state for use in callbacks
  const sidebarItemsRef = useRef(sidebarItems);
  const userMenuItemsRef = useRef(userMenuItems);
  sidebarItemsRef.current = sidebarItems;
  userMenuItemsRef.current = userMenuItems;

  // Unique instance id to identify our own events
  const instanceId = useRef(Math.random().toString(36).slice(2));

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: NavCustomizationState = JSON.parse(stored);
        const newSidebar = { ...DEFAULT_SIDEBAR_ITEMS, ...parsed.sidebarItems };
        const newMenu = { ...DEFAULT_USER_MENU_ITEMS, ...parsed.userMenuItems };
        setSidebarItems(newSidebar);
        setUserMenuItems(newMenu);
        sidebarItemsRef.current = newSidebar;
        userMenuItemsRef.current = newMenu;
      }
    } catch (error) {
      console.error(
        "Failed to load nav customization from localStorage:",
        error
      );
    } finally {
      setHasLoaded(true);
    }
  }, [storageKey]);

  // Save to localStorage and notify other hook instances
  const saveAndNotify = useCallback(
    (newSidebar: Record<string, boolean>, newMenu: Record<string, boolean>) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            sidebarItems: newSidebar,
            userMenuItems: newMenu,
            timestamp: Date.now(),
          })
        );
        window.dispatchEvent(
          new CustomEvent(NAV_CUSTOMIZATION_EVENT, {
            detail: { orgId, sourceId: instanceId.current },
          })
        );
      } catch (error) {
        console.error(
          "Failed to save nav customization to localStorage:",
          error
        );
      }
    },
    [storageKey, orgId]
  );

  // Listen for changes from other hook instances in the same tab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Skip events we dispatched ourselves
      if (detail?.sourceId === instanceId.current) return;
      if (detail?.orgId !== orgId) return;

      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed: NavCustomizationState = JSON.parse(stored);
          const newSidebar = {
            ...DEFAULT_SIDEBAR_ITEMS,
            ...parsed.sidebarItems,
          };
          const newMenu = {
            ...DEFAULT_USER_MENU_ITEMS,
            ...parsed.userMenuItems,
          };
          setSidebarItems(newSidebar);
          setUserMenuItems(newMenu);
          sidebarItemsRef.current = newSidebar;
          userMenuItemsRef.current = newMenu;
        }
      } catch {
        // Ignore parse errors from other instances
      }
    };

    window.addEventListener(NAV_CUSTOMIZATION_EVENT, handler);
    return () => window.removeEventListener(NAV_CUSTOMIZATION_EVENT, handler);
  }, [orgId, storageKey]);

  const setSidebarItemVisible = useCallback(
    (id: string, visible: boolean) => {
      const newSidebar = { ...sidebarItemsRef.current, [id]: visible };
      setSidebarItems(newSidebar);
      sidebarItemsRef.current = newSidebar;
      saveAndNotify(newSidebar, userMenuItemsRef.current);
    },
    [saveAndNotify]
  );

  const setUserMenuItemVisible = useCallback(
    (id: string, visible: boolean) => {
      const newMenu = { ...userMenuItemsRef.current, [id]: visible };
      setUserMenuItems(newMenu);
      userMenuItemsRef.current = newMenu;
      saveAndNotify(sidebarItemsRef.current, newMenu);
    },
    [saveAndNotify]
  );

  const resetToDefaults = useCallback(() => {
    const newSidebar = { ...DEFAULT_SIDEBAR_ITEMS };
    const newMenu = { ...DEFAULT_USER_MENU_ITEMS };
    setSidebarItems(newSidebar);
    setUserMenuItems(newMenu);
    sidebarItemsRef.current = newSidebar;
    userMenuItemsRef.current = newMenu;
    saveAndNotify(newSidebar, newMenu);
  }, [saveAndNotify]);

  return {
    sidebarItems,
    userMenuItems,
    setSidebarItemVisible,
    setUserMenuItemVisible,
    resetToDefaults,
    hasLoaded,
  };
}
