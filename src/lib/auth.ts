import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
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
      schema: {
        organization: {
          additionalFields: {
            workspaceUrl: {
              type: "string",
              required: false,
              input: true,
            },
          },
        },
      },
    }),
    genericOAuth({
      config: [
        // Admin account-level OAuth
        {
          providerId: "databricks-account",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          authorizationUrl: `https://accounts.cloud.databricks.com/oidc/accounts/${process.env.DATABRICKS_ACCOUNT_ID}/v1/authorize`,
          tokenUrl: `https://accounts.cloud.databricks.com/oidc/accounts/${process.env.DATABRICKS_ACCOUNT_ID}/v1/token`,
          scopes: ["all-apis", "offline_access"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const accessToken = tokens.accessToken;
            if (!accessToken || typeof accessToken !== 'string') {
              throw new Error(`Invalid access token`);
            }
            const decoded = decodeJwt(accessToken);
            return {
              id: decoded.sub as string,
              email: (decoded.email as string) || (decoded.sub as string),
              name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
              emailVerified: true,
            };
          },
        },
        // Workspace OAuth proxy - supports multiple workspaces via providerId encoding
        // Client uses providerId format: "databricks-workspace-{orgId}"
        // Proxy extracts orgId, looks up workspace URL, and routes appropriately
        {
          providerId: "databricks-workspace-org_1760054253741_j008t",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          // Proxy endpoints that extract orgId from providerId
          authorizationUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/authorize`,
          tokenUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/token`,
          redirectURI: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/callback`,
          scopes: ["all-apis", "offline_access"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const accessToken = tokens.accessToken;
            if (!accessToken || typeof accessToken !== 'string') {
              throw new Error(`Invalid access token`);
            }
            const decoded = decodeJwt(accessToken);
            return {
              id: decoded.sub as string,
              email: (decoded.email as string) || (decoded.sub as string),
              name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
              emailVerified: true,
            };
          },
        },
        {
          providerId: "databricks-workspace-rZ8wrLdBYL35hySc5OKZLfL6HNZNdiHX",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          // Proxy endpoints that extract orgId from providerId
          authorizationUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/authorize`,
          tokenUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/token`,
          redirectURI: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/callback`,
          scopes: ["all-apis", "offline_access"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const accessToken = tokens.accessToken;
            if (!accessToken || typeof accessToken !== 'string') {
              throw new Error(`Invalid access token`);
            }
            const decoded = decodeJwt(accessToken);
            return {
              id: decoded.sub as string,
              email: (decoded.email as string) || (decoded.sub as string),
              name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
              emailVerified: true,
            };
          },
        },
        {
          providerId: "databricks-workspace",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          // Proxy endpoints that extract orgId from providerId
          authorizationUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/authorize`,
          tokenUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/token`,
          redirectURI: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/callback`,
          scopes: ["all-apis", "offline_access"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const accessToken = tokens.accessToken;
            if (!accessToken || typeof accessToken !== 'string') {
              throw new Error(`Invalid access token`);
            }
            const decoded = decodeJwt(accessToken);
            return {
              id: decoded.sub as string,
              email: (decoded.email as string) || (decoded.sub as string),
              name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
              emailVerified: true,
            };
          },
        },
      ],
    }),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          console.log("=== SESSION CREATE HOOK ===");
          console.log("User ID:", session.userId);

          // Get user's memberships
          const memberships = await db
            .select()
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId));

          if (memberships.length === 0) {
            console.log("User has no memberships, creating session without active org");
            return { data: session };
          }

          const memberOrgIds = memberships.map(m => m.organizationId);
          console.log("User belongs to orgs:", memberOrgIds);

          // Try to find the most recent OAuth flow for this user's orgs
          const recentFlows = await db
            .select()
            .from(schema.oauthFlowMapping)
            .orderBy(schema.oauthFlowMapping.createdAt)
            .limit(50);

          console.log("Total recent OAuth flows:", recentFlows.length);

          // Find the most recent flow matching one of user's orgs
          let targetOrgId: string | null = null;
          for (const flow of recentFlows.reverse()) { // Most recent first
            if (memberOrgIds.includes(flow.organizationId)) {
              targetOrgId = flow.organizationId;
              console.log("Found matching OAuth flow for org:", targetOrgId, "created:", flow.createdAt);
              break;
            }
          }

          // Fallback to first membership if no OAuth flow found
          if (!targetOrgId) {
            targetOrgId = memberships[0].organizationId;
            console.log("No matching OAuth flow, using first membership:", targetOrgId);
          }

          console.log("Setting active org to:", targetOrgId);

          return {
            data: {
              ...session,
              activeOrganizationId: targetOrgId,
            },
          };
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export type Session = typeof auth.$Infer.Session;



export const middlewareAuth = betterAuth({
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
      schema: {
        organization: {
          additionalFields: {
            workspaceUrl: {
              type: "string",
              required: false,
              input: true,
            },
          },
        },
      },
    }),
    genericOAuth({
      config: [
        // Admin account-level OAuth
        {
          providerId: "databricks-account",
          clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
          clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
          authorizationUrl: `https://accounts.cloud.databricks.com/oidc/accounts/${process.env.DATABRICKS_ACCOUNT_ID}/v1/authorize`,
          tokenUrl: `https://accounts.cloud.databricks.com/oidc/accounts/${process.env.DATABRICKS_ACCOUNT_ID}/v1/token`,
          scopes: ["all-apis", "offline_access"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const accessToken = tokens.accessToken;
            if (!accessToken || typeof accessToken !== 'string') {
              throw new Error(`Invalid access token`);
            }
            const decoded = decodeJwt(accessToken);
            return {
              id: decoded.sub as string,
              email: (decoded.email as string) || (decoded.sub as string),
              name: (decoded.name as string) || (decoded.email as string) || (decoded.sub as string),
              emailVerified: true,
            };
          },
        },
      ],
    }),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          console.log("=== SESSION CREATE HOOK ===");
          console.log("User ID:", session.userId);

          // Get user's memberships
          const memberships = await db
            .select()
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId));

          if (memberships.length === 0) {
            console.log("User has no memberships, creating session without active org");
            return { data: session };
          }

          const memberOrgIds = memberships.map(m => m.organizationId);
          console.log("User belongs to orgs:", memberOrgIds);

          // Try to find the most recent OAuth flow for this user's orgs
          const recentFlows = await db
            .select()
            .from(schema.oauthFlowMapping)
            .orderBy(schema.oauthFlowMapping.createdAt)
            .limit(50);

          console.log("Total recent OAuth flows:", recentFlows.length);

          // Find the most recent flow matching one of user's orgs
          let targetOrgId: string | null = null;
          for (const flow of recentFlows.reverse()) { // Most recent first
            if (memberOrgIds.includes(flow.organizationId)) {
              targetOrgId = flow.organizationId;
              console.log("Found matching OAuth flow for org:", targetOrgId, "created:", flow.createdAt);
              break;
            }
          }

          // Fallback to first membership if no OAuth flow found
          if (!targetOrgId) {
            targetOrgId = memberships[0].organizationId;
            console.log("No matching OAuth flow, using first membership:", targetOrgId);
          }

          console.log("Setting active org to:", targetOrgId);

          return {
            data: {
              ...session,
              activeOrganizationId: targetOrgId,
            },
          };
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export type MiddlewareSession = typeof middlewareAuth.$Infer.Session;
