import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { unstable_cache } from "next/cache";

export const ORGANIZATIONS_CACHE_TAG = "organizations";

// Cache tag for organizations
const getOrganizations = unstable_cache(
  async () => {
    return db.select().from(schema.organization);
  },
  ["all-organizations"],
  { tags: [ORGANIZATIONS_CACHE_TAG], revalidate: false }
);

// Base provider config template
const createWorkspaceProviderConfig = (orgId: string) => ({
  providerId: `databricks-workspace-${orgId}`,
  clientId: process.env.DATABRICKS_U2M_CLIENT_ID!,
  clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET!,
  authorizationUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/authorize`,
  tokenUrl: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/token`,
  redirectURI: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/oauth/databricks/callback`,
  scopes: ["all-apis", "offline_access"],
  pkce: true,
  getUserInfo: async (tokens: { accessToken?: unknown; refreshToken?: unknown }) => {
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
});

// Generate auth instance with dynamic providers
export async function createAuthInstance() {
  const organizations = await getOrganizations();

  // Generate workspace providers for each organization
  const workspaceProviders = organizations.map(org =>
    createWorkspaceProviderConfig(org.id)
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      organization({
        async sendInvitationEmail(data) {
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
          // Dynamically generated workspace providers
          ...workspaceProviders,
        ],
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            console.log("=== SESSION CREATE HOOK ===");
            console.log("User ID:", session.userId);

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

            const recentFlows = await db
              .select()
              .from(schema.oauthFlowMapping)
              .orderBy(schema.oauthFlowMapping.createdAt)
              .limit(50);

            console.log("Total recent OAuth flows:", recentFlows.length);

            let targetOrgId: string | null = null;
            for (const flow of recentFlows.reverse()) {
              if (memberOrgIds.includes(flow.organizationId)) {
                targetOrgId = flow.organizationId;
                console.log("Found matching OAuth flow for org:", targetOrgId, "created:", flow.createdAt);
                break;
              }
            }

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
}

// Cache the auth instance, but regenerate it when organizations change
// We use a timestamp-based approach to detect when to regenerate
let authInstancePromise: Promise<Awaited<ReturnType<typeof createAuthInstance>>> | null = null;
let lastOrgCount = 0;

export async function getAuthInstance() {
  // Check if we need to regenerate the auth instance
  const orgs = await getOrganizations();

  // If org count changed, regenerate the auth instance
  if (orgs.length !== lastOrgCount || !authInstancePromise) {
    lastOrgCount = orgs.length;
    authInstancePromise = createAuthInstance();
  }

  return authInstancePromise;
}

// Type inference
export type Session = Awaited<ReturnType<typeof getAuthInstance>> extends infer T
  ? T extends { $Infer: { Session: infer S } }
    ? S
    : never
  : never;
