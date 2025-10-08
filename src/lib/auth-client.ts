import { createAuthClient } from "better-auth/react";
import { organizationClient, genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [
    organizationClient(),
    genericOAuthClient(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  organization: orgClient,
} = authClient;
