import { createAuthClient } from "better-auth/react";
import { organizationClient, genericOAuthClient, adminClient, jwtClient } from "better-auth/client/plugins";

// Use the environment variable if set, otherwise use the current origin (for production)
// or fallback to localhost for development
const getBaseURL = () => {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }

  // In the browser, use the current origin
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Fallback for server-side rendering during development
  return "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    adminClient(),
    jwtClient(),
    organizationClient({
      schema: {
        organization: {
          additionalFields: {
            workspaceUrl: {
              type: "string",
              required: false,
            },
          },
        },
      },
    }),
    genericOAuthClient(),
  ],
  fetchOptions: {
    onError(context) {
      console.error("Auth client error:", context);
    },
  },
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  organization,
  admin,
} = authClient;

// Also export organization as orgClient for backwards compatibility
export const orgClient = organization;
