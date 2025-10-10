import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth, admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { updateUserScimMapping } from "./databricks-scim";

export const middlewareAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  user: {
    additionalFields: {
      accountIdUserIdMapping: {
        type: "string",
        required: false,
        input: false, // Don't allow direct user input
      },
    },
  },
  session: {
    additionalFields: {
      impersonatedBy: {
        type: "string",
        required: false,
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
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
        after: async (session) => {
          console.log("=== MIDDLEWARE SESSION CREATE AFTER HOOK ===");
          console.log("Session created for user:", session.userId);

          // Get user details to fetch email
          const users = await db
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, session.userId));

          if (users.length === 0) {
            console.log("User not found, skipping SCIM mapping");
            return;
          }

          const user = users[0];

          // Update SCIM mapping after session creation
          try {
            await updateUserScimMapping(user.id, user.email);
          } catch (error) {
            console.error("Error updating SCIM mapping in middleware after hook:", error);
          }
        },
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
});

export type MiddlewareSession = typeof middlewareAuth.$Infer.Session;
