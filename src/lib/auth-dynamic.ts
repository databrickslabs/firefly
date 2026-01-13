import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth, admin, okta } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { unstable_cache } from "next/cache";
import { updateUserScimMapping } from "./databricks-scim";

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

  const oktaConfig = okta({
    clientId: process.env.SPN_AUTH_OKTA_CLIENT_ID!,
    clientSecret: process.env.SPN_AUTH_OKTA_CLIENT_SECRET!,
    issuer: process.env.SPN_AUTH_OKTA_ISSUER!,
  })

  oktaConfig.providerId = "databricks-spn-mapping"

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
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
          oktaConfig,
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

            // First, try to get the org from the account that was just used for this session
            // The account's providerId is in format: databricks-workspace-{orgId}
            const accounts = await db
              .select()
              .from(schema.account)
              .where(eq(schema.account.userId, session.userId));

            console.log("User has", accounts.length, "account(s)");

            let targetOrgId: string | null = null;

            // Try to extract org from the most recently created account (the one just used for OAuth)
            if (accounts.length > 0) {
              // Sort by createdAt descending to get most recent
              const sortedAccounts = accounts.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );

              for (const account of sortedAccounts) {
                // providerId format: databricks-workspace-{orgId}
                if (account.providerId.startsWith("databricks-workspace-")) {
                  const orgIdFromProvider = account.providerId.replace("databricks-workspace-", "");
                  console.log("Found org from account providerId:", orgIdFromProvider);
                  targetOrgId = orgIdFromProvider;
                  break;
                }
              }
            }

            // Fallback: check memberships
            if (!targetOrgId) {
              const memberships = await db
                .select()
                .from(schema.member)
                .where(eq(schema.member.userId, session.userId));

              if (memberships.length > 0) {
                targetOrgId = memberships[0].organizationId;
                console.log("Using first membership as fallback:", targetOrgId);
              } else {
                console.log("User has no memberships, creating session without active org");
                return { data: session };
              }
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
            console.log("=== DYNAMIC AUTH SESSION CREATE AFTER HOOK ===");
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
              console.error("Error updating SCIM mapping in dynamic auth after hook:", error);
            }
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
