'use client'

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserStoreProvider } from '@/providers/user-store-provider'
import type { DatabricksTokenInfo } from '@/lib/databricks-token'
import { Loader2 } from 'lucide-react'

interface UserDataResponse {
  data: DatabricksTokenInfo
}

export function UserStoreInitializer({ children }: { children: ReactNode }) {
  // Fetch user data once on mount
  const { data: userData, isLoading, error } = useQuery<UserDataResponse>({
    queryKey: ['user-data'],
    queryFn: async () => {
      const response = await fetch('/api/databricks/user-data')
      if (!response.ok) {
        throw new Error('Failed to fetch user data')
      }
      return response.json()
    },
    staleTime: Infinity, // User data doesn't change during session
    retry: 1,
  })

  // Show loading state while fetching initial data
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Initializing workspace...</p>
        </div>
      </div>
    )
  }

  // Show error state if fetch fails
  if (error || !userData?.data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">Failed to load user data</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Initialize store with fetched data
  return (
    <UserStoreProvider initialData={userData.data}>
      {children}
    </UserStoreProvider>
  )
}
