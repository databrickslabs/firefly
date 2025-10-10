/**
 * Databricks SCIM API client for user management
 *
 * This library provides functions to interact with the Databricks SCIM API
 * to lookup and manage user information across Databricks accounts.
 */

interface ScimUser {
  id: string;
  userName: string;
  displayName?: string;
  active?: boolean;
  emails?: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
}

interface ScimListResponse {
  Resources: ScimUser[];
  itemsPerPage: number;
  startIndex: number;
  totalResults: number;
}

/**
 * Lookup a user in Databricks SCIM by their email address
 *
 * @param accountId - The Databricks account ID
 * @param email - The user's email address (userName in SCIM)
 * @param accessToken - The Databricks account-level access token
 * @returns The SCIM user ID or null if not found
 */
export async function lookupUserByEmail(
  accountId: string,
  email: string,
  accessToken: string
): Promise<string | null> {
  try {
    // SCIM filter to find user by userName (email)
    const filter = `userName eq "${email}"`;
    const url = `https://accounts.cloud.databricks.com/api/2.0/accounts/${accountId}/scim/v2/Users?filter=${encodeURIComponent(filter)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/scim+json',
      },
    });

    if (!response.ok) {
      console.error(`SCIM API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: ScimListResponse = await response.json();

    // Return the first matching user's ID
    if (data.Resources && data.Resources.length > 0) {
      return data.Resources[0].id;
    }

    console.log(`No SCIM user found for email: ${email}`);
    return null;
  } catch (error) {
    console.error('Error looking up user in SCIM:', error);
    return null;
  }
}

/**
 * Get account-level access token from user's OAuth accounts
 *
 * @param userId - The user's ID
 * @returns The access token or null if not found
 */
export async function getDatabricksAccountToken(userId: string): Promise<string | null> {
  try {
    const { db } = await import('@/db');
    const { account } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Look for a databricks-account provider token
    const accounts = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, 'databricks-account')
        )
      );

    if (accounts.length === 0) {
      console.log(`No databricks-account OAuth account found for user: ${userId}`);
      return null;
    }

    const databricksAccount = accounts[0];

    // Check if token is expired and needs refresh
    if (databricksAccount.accessTokenExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(databricksAccount.accessTokenExpiresAt);

      if (now >= expiresAt) {
        console.log('Access token expired, needs refresh');
        // TODO: Implement token refresh logic
        return null;
      }
    }

    return databricksAccount.accessToken;
  } catch (error) {
    console.error('Error getting Databricks account token:', error);
    return null;
  }
}

/**
 * Update user's accountIdUserIdMapping field with SCIM user ID
 *
 * @param userId - The user's ID in the local database
 * @param email - The user's email address
 * @returns true if successfully updated, false otherwise
 */
export async function updateUserScimMapping(
  userId: string,
  email: string
): Promise<boolean> {
  try {
    const accountId = process.env.DATABRICKS_ACCOUNT_ID;
    if (!accountId) {
      console.error('DATABRICKS_ACCOUNT_ID not configured');
      return false;
    }

    // Get the user's Databricks account access token
    const accessToken = await getDatabricksAccountToken(userId);
    if (!accessToken) {
      console.log('No access token available, skipping SCIM mapping update');
      return false;
    }

    // Lookup the user's SCIM ID
    const scimUserId = await lookupUserByEmail(accountId, email, accessToken);
    if (!scimUserId) {
      console.log('Could not find SCIM user ID, skipping mapping update');
      return false;
    }

    // Update the user's accountIdUserIdMapping field
    const { db } = await import('@/db');
    const { user } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    // Create mapping object: { [accountId]: scimUserId }
    const mapping: Record<string, string> = {};
    mapping[accountId] = scimUserId;

    await db
      .update(user)
      .set({
        accountIdUserIdMapping: JSON.stringify(mapping),
      })
      .where(eq(user.id, userId));

    console.log(`Updated SCIM mapping for user ${userId}: ${accountId} -> ${scimUserId}`);
    return true;
  } catch (error) {
    console.error('Error updating user SCIM mapping:', error);
    return false;
  }
}

/**
 * Get SCIM user ID for a specific account from user's mapping
 *
 * @param accountIdUserIdMapping - The JSON string from user's accountIdUserIdMapping field
 * @param accountId - The Databricks account ID to lookup
 * @returns The SCIM user ID or null if not found
 */
export function getScimUserIdFromMapping(
  accountIdUserIdMapping: string | null,
  accountId: string
): string | null {
  if (!accountIdUserIdMapping) {
    return null;
  }

  try {
    const mapping: Record<string, string> = JSON.parse(accountIdUserIdMapping);
    return mapping[accountId] || null;
  } catch (error) {
    console.error('Error parsing accountIdUserIdMapping:', error);
    return null;
  }
}
