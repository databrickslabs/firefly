import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, organizationStorageSettings, userSpns, user } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface GroupMember {
  value: string;  // User ID (principalId)
  display: string;  // Display name
}

interface GroupInfo {
  id: string;
  displayName: string;
  memberCount: number;
  members: GroupMember[];
}

interface MissingMember {
  email: string;
  name: string;
}

// Catalog permissions organized by category (relevant for organization group access)
const ALL_CATALOG_PERMISSIONS = {
  prerequisite: ["USE_CATALOG", "USE_SCHEMA"],
  metadata: ["BROWSE"],
  read: ["EXECUTE", "READ_VOLUME", "SELECT"],
  edit: ["MODIFY", "REFRESH", "WRITE_VOLUME"],
  create: [
    "CREATE_FUNCTION",
    "CREATE_MATERIALIZED_VIEW",
    "CREATE_SCHEMA",
    "CREATE_TABLE",
    "CREATE_VOLUME",
  ],
} as const;

type PermissionCategory = keyof typeof ALL_CATALOG_PERMISSIONS;

interface CatalogPermissions {
  grantedPermissions: string[];
  permissionsByCategory: Record<PermissionCategory, { permission: string; granted: boolean }[]>;
  hasAllPrivileges: boolean;
  error?: string;
}

interface VolumeInfo {
  name: string;
  fullName: string;
  volumeType: string;
  owner: string | null;
  storageLocation: string | null;
  createdAt: number | null;
}

interface UserVolumeStatus {
  email: string;
  name: string;
  expectedVolumeName: string;
  hasVolume: boolean;
}

/**
 * Converts an email to a valid volume name by replacing ".", spaces, and "/" with "_"
 * Note: "@" is allowed in volume names
 */
function emailToVolumeName(email: string): string {
  return email
    .replace(/\./g, '_')
    .replace(/\s/g, '_')
    .replace(/\//g, '_');
}

interface UploadsSchemaInfo {
  exists: boolean;
  fullName: string | null;
  name: string | null;
  catalogName: string | null;
  owner: string | null;
  createdAt: number | null;
  volumes: VolumeInfo[];
  volumeCount: number;
  userVolumes: UserVolumeStatus[];
  usersWithoutVolumes: number;
  error?: string;
}

interface StorageSettingsStatus {
  hasStorageSettings: boolean;
  groupExists: boolean;
  groupInfo: GroupInfo | null;
  storageSettings: {
    primaryOrganizationGroup: string | null;
    primaryOrganizationGroupId: string | null;
    organizationEditableCatalog: string | null;
  } | null;
  missingMembers: MissingMember[];
  missingMemberCount: number;
  catalogPermissions: CatalogPermissions | null;
  uploadsSchema: UploadsSchemaInfo | null;
  error?: string;
}

/**
 * Gets an OAuth token for the global admin SPN
 */
async function getGlobalAdminToken(workspaceUrl: string): Promise<string> {
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Global admin SPN credentials not configured");
  }

  const baseUrl = workspaceUrl.replace(/\/$/, '');
  const tokenUrl = `${baseUrl}/oidc/v1/token`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Failed to get global admin token:", errorText);
    throw new Error(`Failed to get global admin token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Checks if a group exists in the Databricks workspace using the SCIM API
 */
async function checkGroupExists(
  workspaceUrl: string,
  groupId: string,
  accessToken: string
): Promise<{ exists: boolean; groupInfo: GroupInfo | null; error?: string }> {
  const baseUrl = workspaceUrl.replace(/\/$/, '');
  const scimUrl = `${baseUrl}/api/2.0/preview/scim/v2/Groups/${groupId}`;

  try {
    const response = await fetch(scimUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const groupData = await response.json();
      // Extract members with their IDs and display names
      const members: GroupMember[] = (groupData.members || []).map((m: { value: string; display?: string }) => ({
        value: m.value,
        display: m.display || "",
      }));
      return {
        exists: true,
        groupInfo: {
          id: groupData.id,
          displayName: groupData.displayName,
          memberCount: members.length,
          members,
        },
      };
    }

    if (response.status === 404) {
      return { exists: false, groupInfo: null };
    }

    const errorText = await response.text();
    console.error("Error checking group:", errorText);
    return { exists: false, groupInfo: null, error: `API error: ${response.status}` };
  } catch (error) {
    console.error("Error checking group existence:", error);
    return { exists: false, groupInfo: null, error: String(error) };
  }
}

/**
 * Gets catalog permissions for a specific principal (group) using the Unity Catalog Grants API
 */
async function getCatalogPermissions(
  workspaceUrl: string,
  catalogName: string,
  principal: string,
  accessToken: string
): Promise<CatalogPermissions> {
  const baseUrl = workspaceUrl.replace(/\/$/, '');
  const permissionsUrl = `${baseUrl}/api/2.1/unity-catalog/permissions/catalog/${encodeURIComponent(catalogName)}?principal=${encodeURIComponent(principal)}&max_results=0`;

  try {
    const response = await fetch(permissionsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error fetching catalog permissions:", errorText);
      return {
        grantedPermissions: [],
        permissionsByCategory: buildPermissionsByCategory([]),
        hasAllPrivileges: false,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();

    // Find the principal's permissions in the response
    const principalAssignment = data.privilege_assignments?.find(
      (pa: { principal: string }) => pa.principal === principal
    );

    const grantedPermissions: string[] = principalAssignment?.privileges || [];
    const hasAllPrivileges = grantedPermissions.includes("ALL_PRIVILEGES");

    return {
      grantedPermissions,
      permissionsByCategory: buildPermissionsByCategory(grantedPermissions),
      hasAllPrivileges,
    };
  } catch (error) {
    console.error("Error fetching catalog permissions:", error);
    return {
      grantedPermissions: [],
      permissionsByCategory: buildPermissionsByCategory([]),
      hasAllPrivileges: false,
      error: String(error),
    };
  }
}

/**
 * Build permissions by category with granted status
 */
function buildPermissionsByCategory(
  grantedPermissions: string[]
): Record<PermissionCategory, { permission: string; granted: boolean }[]> {
  const grantedSet = new Set(grantedPermissions);
  const hasAllPrivileges = grantedSet.has("ALL_PRIVILEGES");

  const result: Record<PermissionCategory, { permission: string; granted: boolean }[]> = {
    prerequisite: [],
    metadata: [],
    read: [],
    edit: [],
    create: [],
  };

  for (const category of Object.keys(ALL_CATALOG_PERMISSIONS) as PermissionCategory[]) {
    result[category] = ALL_CATALOG_PERMISSIONS[category].map(permission => ({
      permission,
      // If ALL_PRIVILEGES is granted, all permissions are effectively granted
      granted: grantedSet.has(permission) || hasAllPrivileges,
    }));
  }

  return result;
}

/**
 * Lists all volumes in a schema using the Unity Catalog Volumes API
 */
async function listVolumesInSchema(
  workspaceUrl: string,
  catalogName: string,
  schemaName: string,
  accessToken: string
): Promise<{ volumes: VolumeInfo[]; error?: string }> {
  const baseUrl = workspaceUrl.replace(/\/$/, '');
  const volumesUrl = `${baseUrl}/api/2.1/unity-catalog/volumes?catalog_name=${encodeURIComponent(catalogName)}&schema_name=${encodeURIComponent(schemaName)}&max_results=0`;

  const allVolumes: VolumeInfo[] = [];
  let nextPageToken: string | undefined;

  try {
    // Paginate through all volumes
    do {
      const url = nextPageToken
        ? `${volumesUrl}&page_token=${encodeURIComponent(nextPageToken)}`
        : volumesUrl;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error listing volumes:", errorText);
        return { volumes: [], error: `API error: ${response.status}` };
      }

      const data = await response.json();

      // Map volumes to VolumeInfo
      const volumes: VolumeInfo[] = (data.volumes || []).map((v: {
        name: string;
        full_name: string;
        volume_type: string;
        owner?: string;
        storage_location?: string;
        created_at?: number;
      }) => ({
        name: v.name,
        fullName: v.full_name,
        volumeType: v.volume_type,
        owner: v.owner || null,
        storageLocation: v.storage_location || null,
        createdAt: v.created_at || null,
      }));

      allVolumes.push(...volumes);
      nextPageToken = data.next_page_token;
    } while (nextPageToken);

    return { volumes: allVolumes };
  } catch (error) {
    console.error("Error listing volumes:", error);
    return { volumes: [], error: String(error) };
  }
}

/**
 * Checks if the uploads schema exists in the catalog using the Unity Catalog Schemas API
 */
async function checkUploadsSchemaExists(
  workspaceUrl: string,
  catalogName: string,
  accessToken: string
): Promise<UploadsSchemaInfo> {
  const baseUrl = workspaceUrl.replace(/\/$/, '');
  const schemaFullName = `${catalogName}.uploads`;
  const schemaUrl = `${baseUrl}/api/2.1/unity-catalog/schemas/${encodeURIComponent(schemaFullName)}`;

  try {
    const response = await fetch(schemaUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const schemaData = await response.json();

      // Fetch volumes in the uploads schema
      const volumesResult = await listVolumesInSchema(
        workspaceUrl,
        catalogName,
        "uploads",
        accessToken
      );

      return {
        exists: true,
        fullName: schemaData.full_name || schemaFullName,
        name: schemaData.name || "uploads",
        catalogName: schemaData.catalog_name || catalogName,
        owner: schemaData.owner || null,
        createdAt: schemaData.created_at || null,
        volumes: volumesResult.volumes,
        volumeCount: volumesResult.volumes.length,
        userVolumes: [], // Computed later in the handler
        usersWithoutVolumes: 0, // Computed later in the handler
      };
    }

    if (response.status === 404) {
      return {
        exists: false,
        fullName: schemaFullName,
        name: "uploads",
        catalogName: catalogName,
        owner: null,
        createdAt: null,
        volumes: [],
        volumeCount: 0,
        userVolumes: [],
        usersWithoutVolumes: 0,
      };
    }

    const errorText = await response.text();
    console.error("Error checking uploads schema:", errorText);
    return {
      exists: false,
      fullName: schemaFullName,
      name: "uploads",
      catalogName: catalogName,
      owner: null,
      createdAt: null,
      volumes: [],
      volumeCount: 0,
      userVolumes: [],
      usersWithoutVolumes: 0,
      error: `API error: ${response.status}`,
    };
  } catch (error) {
    console.error("Error checking uploads schema existence:", error);
    return {
      exists: false,
      fullName: schemaFullName,
      name: "uploads",
      catalogName: catalogName,
      owner: null,
      createdAt: null,
      volumes: [],
      volumeCount: 0,
      userVolumes: [],
      usersWithoutVolumes: 0,
      error: String(error),
    };
  }
}

/**
 * GET /api/sso-spn/storage-settings/verify-group
 *
 * Verifies that the organization's storage settings group exists in the Databricks workspace.
 * Uses the global admin SPN credentials to make the SCIM API call.
 */
export async function GET() {
  try {
    // Get the current session
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    if (!session.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session" },
        { status: 401 }
      );
    }

    const activeOrgId = session.session.activeOrganizationId;

    // Fetch the organization to get workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!org.workspaceUrl) {
      return NextResponse.json(
        { error: "No workspace URL configured for this organization" },
        { status: 400 }
      );
    }

    // Fetch storage settings for this organization
    const [storageSettings] = await db
      .select()
      .from(organizationStorageSettings)
      .where(eq(organizationStorageSettings.organizationId, activeOrgId))
      .limit(1);

    // If no storage settings exist, return early
    if (!storageSettings) {
      const response: StorageSettingsStatus = {
        hasStorageSettings: false,
        groupExists: false,
        groupInfo: null,
        storageSettings: null,
        missingMembers: [],
        missingMemberCount: 0,
        catalogPermissions: null,
        uploadsSchema: null,
      };
      return NextResponse.json({ data: response });
    }

    // Get the global admin token
    let accessToken: string;
    try {
      accessToken = await getGlobalAdminToken(org.workspaceUrl);
    } catch (error) {
      console.error("Failed to get global admin token:", error);
      const response: StorageSettingsStatus = {
        hasStorageSettings: true,
        groupExists: false,
        groupInfo: null,
        storageSettings: {
          primaryOrganizationGroup: storageSettings.primaryOrganizationGroup,
          primaryOrganizationGroupId: storageSettings.primaryOrganizationGroupId,
          organizationEditableCatalog: storageSettings.organizationEditableCatalog,
        },
        missingMembers: [],
        missingMemberCount: 0,
        catalogPermissions: null,
        uploadsSchema: null,
        error: "Failed to authenticate with Databricks",
      };
      return NextResponse.json({ data: response });
    }

    // Check if the group exists
    const groupResult = await checkGroupExists(
      org.workspaceUrl,
      storageSettings.primaryOrganizationGroupId,
      accessToken
    );

    // Fetch userSpns for this organization's workspace URL, joined with user table for names
    const workspaceUrlNormalized = org.workspaceUrl.replace(/\/$/, '');
    const orgUserSpns = await db
      .select({
        email: userSpns.email,
        principalId: userSpns.principalId,
        name: user.name,
      })
      .from(userSpns)
      .leftJoin(user, eq(userSpns.email, user.email))
      .where(eq(userSpns.workspaceUrl, workspaceUrlNormalized));

    // Compare userSpns principalIds with group member IDs
    let missingMembers: MissingMember[] = [];
    if (groupResult.exists && groupResult.groupInfo) {
      // Get set of principalIds that are in the group
      const groupMemberIds = new Set(
        groupResult.groupInfo.members.map(m => m.value)
      );

      // Find userSpns whose principalId is NOT in the group
      missingMembers = orgUserSpns
        .filter(spn => !groupMemberIds.has(String(spn.principalId)))
        .map(spn => ({
          email: spn.email,
          name: spn.name || spn.email, // Fallback to email if name not found
        }));
    }

    // Fetch catalog permissions for the group
    let catalogPermissions: CatalogPermissions | null = null;
    if (groupResult.exists && storageSettings.organizationEditableCatalog) {
      catalogPermissions = await getCatalogPermissions(
        org.workspaceUrl,
        storageSettings.organizationEditableCatalog,
        storageSettings.primaryOrganizationGroup,
        accessToken
      );
    }

    // Check if the uploads schema exists in the catalog
    let uploadsSchema: UploadsSchemaInfo | null = null;
    if (storageSettings.organizationEditableCatalog) {
      uploadsSchema = await checkUploadsSchemaExists(
        org.workspaceUrl,
        storageSettings.organizationEditableCatalog,
        accessToken
      );

      // Compute per-user volume status if schema exists and has volumes
      if (uploadsSchema.exists) {
        // Create a set of existing volume names for quick lookup
        const existingVolumeNames = new Set(
          uploadsSchema.volumes.map(v => v.name.toLowerCase())
        );

        // Map each user to their expected volume and check if it exists
        const userVolumes: UserVolumeStatus[] = orgUserSpns.map(spn => {
          const expectedVolumeName = emailToVolumeName(spn.email);
          return {
            email: spn.email,
            name: spn.name || spn.email,
            expectedVolumeName,
            hasVolume: existingVolumeNames.has(expectedVolumeName.toLowerCase()),
          };
        });

        uploadsSchema.userVolumes = userVolumes;
        uploadsSchema.usersWithoutVolumes = userVolumes.filter(u => !u.hasVolume).length;
      }
    }

    const response: StorageSettingsStatus = {
      hasStorageSettings: true,
      groupExists: groupResult.exists,
      groupInfo: groupResult.groupInfo,
      storageSettings: {
        primaryOrganizationGroup: storageSettings.primaryOrganizationGroup,
        primaryOrganizationGroupId: storageSettings.primaryOrganizationGroupId,
        organizationEditableCatalog: storageSettings.organizationEditableCatalog,
      },
      missingMembers,
      missingMemberCount: missingMembers.length,
      catalogPermissions,
      uploadsSchema,
      error: groupResult.error,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error verifying storage settings group:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
