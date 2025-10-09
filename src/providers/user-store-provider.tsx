'use client'

import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createUserStore, type UserStore } from '@/stores/user-store'
import type { DatabricksTokenInfo } from '@/lib/databricks-token'
import { getMonacoRootPath } from '@/lib/workspace-file-manager'

const UserStoreContext = createContext<UserStore | null>(null)

export interface UserStoreProviderProps {
  children: ReactNode
  initialData: DatabricksTokenInfo
}

/**
 * Provider component that initializes the Zustand store with server data
 * This ensures no hydration mismatches between server and client
 */
export function UserStoreProvider({ children, initialData }: UserStoreProviderProps) {
  const storeRef = useRef<UserStore | undefined>(undefined)

  // Initialize store only once with server data
  if (!storeRef.current) {
    storeRef.current = createUserStore({
      userEmail: initialData.userEmail,
      monacoRootPath: getMonacoRootPath(initialData.userEmail),
      workspaceUrl: initialData.workspaceUrl,
      activeOrganizationId: initialData.activeOrganizationId,
    })
  }

  return (
    <UserStoreContext.Provider value={storeRef.current}>
      {children}
    </UserStoreContext.Provider>
  )
}

/**
 * Hook to access the full user store
 * Use this when you need multiple properties or the updateUserData action
 */
export function useUserStore() {
  const store = useContext(UserStoreContext)
  if (!store) {
    throw new Error('useUserStore must be used within UserStoreProvider')
  }
  return useStore(store)
}

/**
 * Optimized hook that only subscribes to monacoRootPath
 * Components using this will only re-render when monacoRootPath changes
 */
export function useMonacoRootPath() {
  const store = useContext(UserStoreContext)
  if (!store) {
    throw new Error('useMonacoRootPath must be used within UserStoreProvider')
  }
  return useStore(store, (state) => state.monacoRootPath)
}

/**
 * Optimized hook that only subscribes to userEmail
 * Components using this will only re-render when userEmail changes
 */
export function useUserEmail() {
  const store = useContext(UserStoreContext)
  if (!store) {
    throw new Error('useUserEmail must be used within UserStoreProvider')
  }
  return useStore(store, (state) => state.userEmail)
}

/**
 * Optimized hook that only subscribes to workspaceUrl
 * Components using this will only re-render when workspaceUrl changes
 */
export function useWorkspaceUrl() {
  const store = useContext(UserStoreContext)
  if (!store) {
    throw new Error('useWorkspaceUrl must be used within UserStoreProvider')
  }
  return useStore(store, (state) => state.workspaceUrl)
}

/**
 * Optimized hook that only subscribes to activeOrganizationId
 * Components using this will only re-render when activeOrganizationId changes
 */
export function useActiveOrganizationId() {
  const store = useContext(UserStoreContext)
  if (!store) {
    throw new Error('useActiveOrganizationId must be used within UserStoreProvider')
  }
  return useStore(store, (state) => state.activeOrganizationId)
}
