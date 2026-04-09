'use client'

import { type ReactNode, useEffect, useState } from 'react'
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

/**
 * SSO-SPN specific version of UserStoreInitializer
 * This version redirects to /sso-spn instead of /databricks-idp on errors
 * and uses the SPN token endpoint for user data
 */
export function SsoSpnUserStoreInitializer({ children, orgId }: { children: ReactNode; orgId?: string }) {
  const router = useRouter()
  const { data: session } = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Fetch user data using SPN token endpoint
  const { data: userData, isLoading, error } = useQuery<UserDataResponse>({
    queryKey: ['sso-spn-user-data', orgId],
    queryFn: async () => {
      // Use the SPN-specific user data endpoint
      const response = await fetch('/api/sso-spn/user-data')
      if (!response.ok) {
        // Try to parse error details
        let errorData: UserDataError | undefined
        try {
          errorData = await response.json()
        } catch {
          // If JSON parsing fails, throw generic error
          throw new Error('Failed to fetch user data')
        }

        // Check if it's a 401 Unauthorized (no session or expired session)
        if (response.status === 401) {
          const error: AccountNotFoundError = new Error('Session expired or not found')
          error.requireReauth = true
          console.log('401 Unauthorized - redirecting to sso-spn login')
          throw error
        }

        // Check if org selection is required (user has session but no active org)
        if (errorData?.details === 'REQUIRE_ORG_SELECTION') {
          const error: AccountNotFoundError = new Error('Organization selection required')
          error.accountNotFound = true
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
        if (errorData?.details?.includes('Account not found') || errorData?.details?.includes('No SPN credentials')) {
          const error: AccountNotFoundError = new Error('SPN credentials not found')
          error.accountNotFound = true
          console.log('SPN credentials not found', error)
          throw error
        }

        throw new Error(errorData?.error || 'Failed to fetch user data')
      }
      return response.json()
    },
    staleTime: Infinity, // User data doesn't change during session
    retry: 1,
  })

  // Handle errors requiring sign-out and re-authentication
  const isGuest = session?.user?.role === 'guest'

  useEffect(() => {
    const accountError = error as AccountNotFoundError | null
    console.log('[SsoSpn] useEffect check:', {
      hasError: !!error,
      accountNotFound: accountError?.accountNotFound,
      requireReauth: accountError?.requireReauth,
      hasSession: !!session,
      email: session?.user?.email,
      role: session?.user?.role,
    })

    // Guest users should never be redirected to Okta SSO
    // They authenticated via email/password, not SSO
    if (isGuest) {
      if (error) {
        console.log('[SsoSpn] Guest user encountered error, not redirecting to SSO:', error.message)
      }
      return
    }

    // Handle re-authentication required (invalid token)
    if (error && accountError?.requireReauth && !isSigningOut) {
      console.log('[SsoSpn] Signing out user due to invalid token, requiring re-authentication')
      setIsSigningOut(true)
      signOut({
        fetchOptions: {
          onSuccess: () => {
            console.log('[SsoSpn] Sign out successful, redirecting to /sso-spn for re-authentication')
            router.push('/sso-spn')
          },
          onError: () => {
            console.log('[SsoSpn] Sign out failed (session already revoked), redirecting to /sso-spn')
            router.push('/sso-spn')
          },
        },
      })
      return
    }

    // Handle account not found error
    if (error && accountError?.accountNotFound && !isSigningOut) {
      console.log('[SsoSpn] Signing out user due to SPN credentials not found')
      setIsSigningOut(true)
      signOut({
        fetchOptions: {
          onSuccess: () => {
            console.log('[SsoSpn] Sign out successful, redirecting to /sso-spn')
            router.push('/sso-spn')
          },
          onError: () => {
            console.log('[SsoSpn] Sign out failed, redirecting to /sso-spn anyway')
            router.push('/sso-spn')
          },
        },
      })
    }
  }, [error, session, router, isSigningOut, isGuest])

  // Show loading state while signing out
  if (isSigningOut) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
          <p className="text-muted-foreground">Signing out...</p>
        </div>
      </div>
    )
  }

  // Show loading state while fetching initial data
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
          <p className="text-muted-foreground">Initializing SPN workspace...</p>
        </div>
      </div>
    )
  }

  // Show error state if fetch fails (but not during sign-out)
  if (error || !userData?.data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">Failed to load user data</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
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
