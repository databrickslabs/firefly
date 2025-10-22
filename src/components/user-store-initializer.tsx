'use client'

import { type ReactNode, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserStoreProvider } from '@/providers/user-store-provider'
import type { DatabricksWorkspaceTokenInfo } from '@/lib/databricks-workspace-token'
import { Spinner } from '@/components/ui/spinner'
import { useSession, signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

interface UserDataResponse {
  data: DatabricksWorkspaceTokenInfo
}

interface UserDataError {
  error: string
  details?: string
  requireReauth?: boolean
}

interface AccountNotFoundError extends Error {
  accountNotFound?: boolean
  requireReauth?: boolean
}

export function UserStoreInitializer({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { data: session } = useSession()

  // Fetch user data once on mount
  const { data: userData, isLoading, error } = useQuery<UserDataResponse>({
    queryKey: ['user-data'],
    queryFn: async () => {
      const response = await fetch('/api/databricks/user-data')
      if (!response.ok) {
        // Try to parse error details
        let errorData: UserDataError | undefined
        try {
          errorData = await response.json()
        } catch {
          // If JSON parsing fails, throw generic error
          throw new Error('Failed to fetch user data')
        }

        // Check if org selection is required (user has session but no active org)
        if (errorData?.details === 'REQUIRE_ORG_SELECTION') {
          const error: AccountNotFoundError = new Error('Organization selection required')
          error.accountNotFound = true // Reuse this flag to redirect to org selection
          console.log('User needs to select an organization')
          throw error
        }

        // Check if it's a re-authentication required error
        if (errorData?.requireReauth) {
          const error: AccountNotFoundError = new Error('Re-authentication required')
          error.requireReauth = true
          console.log('Re-authentication required due to invalid token')
          throw error
        }

        // Check if it's an "Account not found" error
        if (errorData?.details?.includes('Account not found')) {
          const error: AccountNotFoundError = new Error('Account not found')
          error.accountNotFound = true
          console.log('Account not found', error)
          throw error
        }

        throw new Error('Failed to fetch user data')
      }
      return response.json()
    },
    staleTime: Infinity, // User data doesn't change during session
    retry: 1,
  })

  // Handle errors requiring sign-out and re-authentication
  useEffect(() => {
    const accountError = error as AccountNotFoundError | null
    console.log('useEffect check:', {
      hasError: !!error,
      accountNotFound: accountError?.accountNotFound,
      requireReauth: accountError?.requireReauth,
      hasSession: !!session,
      email: session?.user?.email
    })

    // Handle re-authentication required (invalid token)
    if (error && accountError?.requireReauth) {
      console.log('Signing out user due to invalid token, requiring re-authentication')
      signOut({
        fetchOptions: {
          onSuccess: () => {
            console.log('Sign out successful, redirecting to /databricks-idp for re-authentication')
            router.push('/databricks-idp')
          },
        },
      })
      return
    }

    // Handle account not found error
    if (error && accountError?.accountNotFound) {
      console.log('Signing out user due to account not found')
      signOut({
        fetchOptions: {
          onSuccess: () => {
            console.log('Sign out successful, redirecting to /databricks-idp')
            router.push('/databricks-idp')
          },
        },
      })
    }
  }, [error, session, router])

  // Show loading state while fetching initial data
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-purple-600 mx-auto" />
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
