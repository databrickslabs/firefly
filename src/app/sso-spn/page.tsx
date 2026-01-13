import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { Key, AlertCircle, CheckCircle2, Database, Link2 } from "lucide-react";
import { CopyTokenButton } from "./copy-token-button";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";

export const dynamic = "force-dynamic";

// Databricks accounts URL and account ID for SPN token generation (from environment variables)
const DATABRICKS_ACCOUNTS_URL = process.env.SPN_AUTH_DATABRICKS_ACCOUNTS_URL || "";
const DATABRICKS_ACCOUNT_ID = process.env.SPN_AUTH_DATABRICKS_ACCOUNT_ID || "";
const DATABRICKS_WORKSPACE_URL = process.env.SPN_AUTH_DATABRICKS_WORKSPACE_URL || "";

interface ProviderAccount {
  providerId: string;
  accountId: string;
}

async function getOktaToken() {
  try {
    const auth = await getAuthInstance();
    const reqHeaders = await headers();

    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (!session) {
      return { error: "Not logged in. Please sign in first.", session: null, accessToken: null, provider: null };
    }

    // Get the list of linked accounts using better-auth API
    let spnProvider: ProviderAccount | null = null;
    try {
      const accountsResponse = await auth.api.listUserAccounts({
        headers: reqHeaders,
      });

      if (accountsResponse && Array.isArray(accountsResponse)) {
        const spnAccount = accountsResponse.find((a: ProviderAccount) => a.providerId === "databricks-spn-mapping");
        if (spnAccount) {
          spnProvider = {
            providerId: spnAccount.providerId,
            accountId: spnAccount.accountId,
          };
        }
      }
    } catch (listError) {
      console.error("Error listing accounts:", listError);
    }

    // Get the access token for the databricks-spn-mapping provider
    const tokenResponse = await auth.api.getAccessToken({
      headers: reqHeaders,
      body: {
        providerId: "databricks-spn-mapping",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return {
        error: "No Okta access token found. Please sign in with Okta.",
        session,
        accessToken: null,
        provider: spnProvider
      };
    }

    return {
      error: null,
      session,
      accessToken: tokenResponse.accessToken,
      provider: spnProvider,
    };
  } catch (error) {
    console.error("Error getting Okta token:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to fetch token",
      session: null,
      accessToken: null,
      provider: null
    };
  }
}

export default async function SsoSpnPage() {
  const { error: oktaError, session, accessToken: oktaAccessToken, provider } = await getOktaToken();

  // Get Databricks SPN tokens if user is logged in
  let accountTokenResult: Awaited<ReturnType<typeof getDatabricksSpnToken>> | null = null;
  let workspaceTokenResult: Awaited<ReturnType<typeof getDatabricksSpnToken>> | null = null;
  if (session) {
    accountTokenResult = await getDatabricksSpnToken(DATABRICKS_ACCOUNTS_URL, DATABRICKS_ACCOUNT_ID);
    workspaceTokenResult = await getDatabricksSpnToken(DATABRICKS_WORKSPACE_URL);
  }

  return (
    <div className="h-full overflow-auto py-12 px-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Custom SSO Mapped to SPN
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tenant-based authentication with service principal identity mapping
          </p>
        </div>

        <div className="max-w-2xl mx-auto p-10 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
                <Key className="w-8 h-8 text-white" />
              </div>
              {session ? (
                <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Logged In</span>
                </div>
              ) : (
                <h2 className="text-2xl font-semibold mb-4">Not Logged In</h2>
              )}
            </div>

            {session && (
              <div className="text-center text-muted-foreground space-y-2">
                <p>Signed in as: <span className="font-mono font-semibold">{session.user.email}</span></p>
                {provider && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Provider: <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{provider.providerId}</span></span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4 text-muted-foreground">
              <p>
                This authentication method allows you to log in per tenant to your identity provider, then map that identity to a service principal (SPN) in your organization.
              </p>

              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                  Key Features:
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>All users in an organization share the same SPN identity</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Per-tenant IDP authentication with SPN mapping</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Optional team/group-based SPN assignment</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">•</span>
                    <span>Users can be assigned to specific team SPNs for granular access control</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Okta Access Token Section */}
        <div className="max-w-2xl mx-auto p-6 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
          <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100 mb-4">
            Okta Access Token
          </h3>

          {oktaError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
                <p className="text-sm text-red-700 dark:text-red-300">{oktaError}</p>
              </div>
            </div>
          )}

          {!oktaError && oktaAccessToken && (
            <div className="space-y-3">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
                <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all whitespace-pre-wrap">
                  {oktaAccessToken}
                </code>
              </div>
              <CopyTokenButton token={oktaAccessToken} />
            </div>
          )}

          {!oktaError && !oktaAccessToken && !session && (
            <p className="text-muted-foreground">
              Please <a href="/sso-spn-login" className="text-emerald-600 hover:underline">sign in</a> to view your access token.
            </p>
          )}
        </div>

        {/* Databricks Account SPN Access Token Section */}
        <div className="max-w-2xl mx-auto p-6 border-2 border-blue-200 dark:border-blue-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              Databricks Account SPN Token
            </h3>
          </div>

          {!session && (
            <p className="text-muted-foreground">
              Please <a href="/sso-spn-login" className="text-blue-600 hover:underline">sign in</a> to view your Databricks SPN token.
            </p>
          )}

          {session && accountTokenResult && !accountTokenResult.success && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
                <p className="text-sm text-red-700 dark:text-red-300">{accountTokenResult.error.error}</p>
                {accountTokenResult.error.details != null && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {typeof accountTokenResult.error.details === 'string'
                      ? accountTokenResult.error.details
                      : JSON.stringify(accountTokenResult.error.details)}
                  </p>
                )}
              </div>
            </div>
          )}

          {session && accountTokenResult && accountTokenResult.success && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Client ID:</span>
                  <p className="font-mono text-xs">{accountTokenResult.data.clientId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Token Type:</span>
                  <p className="font-mono text-xs">{accountTokenResult.data.tokenType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Expires In:</span>
                  <p className="font-mono text-xs">{accountTokenResult.data.expiresIn}s</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target URL:</span>
                  <p className="font-mono text-xs truncate">{DATABRICKS_ACCOUNTS_URL}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
                  <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all whitespace-pre-wrap">
                    {accountTokenResult.data.accessToken}
                  </code>
                </div>
                <CopyTokenButton token={accountTokenResult.data.accessToken} />
              </div>
            </div>
          )}
        </div>

        {/* Databricks Workspace SPN Access Token Section */}
        <div className="max-w-2xl mx-auto p-6 border-2 border-purple-200 dark:border-purple-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
              Databricks Workspace SPN Token
            </h3>
          </div>

          {!session && (
            <p className="text-muted-foreground">
              Please <a href="/sso-spn-login" className="text-purple-600 hover:underline">sign in</a> to view your Databricks workspace token.
            </p>
          )}

          {session && workspaceTokenResult && !workspaceTokenResult.success && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
                <p className="text-sm text-red-700 dark:text-red-300">{workspaceTokenResult.error.error}</p>
                {workspaceTokenResult.error.details != null && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {typeof workspaceTokenResult.error.details === 'string'
                      ? workspaceTokenResult.error.details
                      : JSON.stringify(workspaceTokenResult.error.details)}
                  </p>
                )}
              </div>
            </div>
          )}

          {session && workspaceTokenResult && workspaceTokenResult.success && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Client ID:</span>
                  <p className="font-mono text-xs">{workspaceTokenResult.data.clientId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Token Type:</span>
                  <p className="font-mono text-xs">{workspaceTokenResult.data.tokenType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Expires In:</span>
                  <p className="font-mono text-xs">{workspaceTokenResult.data.expiresIn}s</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target URL:</span>
                  <p className="font-mono text-xs truncate">{DATABRICKS_WORKSPACE_URL}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
                  <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all whitespace-pre-wrap">
                    {workspaceTokenResult.data.accessToken}
                  </code>
                </div>
                <CopyTokenButton token={workspaceTokenResult.data.accessToken} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
