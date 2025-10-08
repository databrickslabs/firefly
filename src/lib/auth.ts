import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { decodeJwt } from "jose";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  plugins: [
    organization({
      async sendInvitationEmail(data) {
        // TODO: Implement email sending logic
        console.log("Invitation email:", data);
      },
    }),
    genericOAuth({
      config: [
        {
          providerId: "databricks-u2m",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          authorizationUrl: `${process.env.DATABRICKS_u2M_URL}/oidc/v1/authorize`,
          tokenUrl: `${process.env.DATABRICKS_u2M_URL}/oidc/v1/token`,
          scopes: ["all-apis", "offline_access"],
          pkce: true, // Enable PKCE for Databricks OAuth
          // Refresh token logic for Databricks
          refreshAccessToken: async (refreshToken) => {
            try {
              const workspaceUrl = process.env.DATABRICKS_u2M_URL;
              const response = await fetch(`${workspaceUrl}/oidc/v1/token`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: refreshToken,
                  client_id: process.env.DATABRICKS_U2M_CLIENT_ID!,
                  client_secret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
                }),
              });

              if (!response.ok) {
                console.error("Failed to refresh Databricks token:", await response.text());
                throw new Error("Failed to refresh Databricks access token");
              }

              const data = await response.json();
              console.log("Successfully refreshed Databricks token");

              return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep the old one
                accessTokenExpiresAt: data.expires_in
                  ? new Date(Date.now() + data.expires_in * 1000)
                  : undefined,
              };
            } catch (error) {
              console.error("Error refreshing Databricks token:", error);
              throw error;
            }
          },
          // Databricks doesn't have a userinfo endpoint, so we decode the JWT access token
          getUserInfo: async (tokens) => {
            try {
              // Log the tokens structure to understand what we're receiving
              console.log("Received tokens:", JSON.stringify(tokens, null, 2));

              // Check if access_token exists and is a string
              const accessToken = tokens.accessToken || tokens.access_token;

              if (!accessToken || typeof accessToken !== 'string') {
                console.error("Invalid access token type:", typeof accessToken);
                console.error("Token value:", accessToken);
                throw new Error(`Invalid access token: expected string, got ${typeof accessToken}`);
              }

              // Decode the JWT access token to extract user information
              const decoded = decodeJwt(accessToken);
              console.log("Decoded JWT:", decoded);

              return {
                id: decoded.sub as string,
                email: (decoded.email as string) || (decoded.sub as string),
                name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
                emailVerified: true, // Databricks users are pre-verified
              };
            } catch (error) {
              console.error("Failed to decode Databricks JWT:", error);
              throw new Error("Failed to extract user info from Databricks token");
            }
          },
          mapProfileToUser: async (profile) => {
            return {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              emailVerified: profile.emailVerified,
            };
          },
        },
      ],
    }),
  ],
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export type Session = typeof auth.$Infer.Session;
