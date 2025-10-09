'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface UserState {
  userEmail: string
  monacoRootPath: string
  workspaceUrl: string
  activeOrganizationId: string
  // Actions
  updateUserData: (data: Partial<Omit<UserState, 'updateUserData'>>) => void
}

/**
 * Factory function to create a user store with initial server data
 * This pattern prevents hydration issues by ensuring server and client
 * start with the same state
 */
export const createUserStore = (initialData: Omit<UserState, 'updateUserData'>) => {
  return create<UserState>()(
    devtools(
      (set) => ({
        ...initialData,
        updateUserData: (data) => set((state) => ({ ...state, ...data })),
      }),
      { name: 'UserStore' }
    )
  )
}

export type UserStore = ReturnType<typeof createUserStore>
