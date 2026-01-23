import { NextResponse } from "next/server";
import { listVolumesAll, createManagedVolume, VolumeInfo } from "@/lib/databricks-volumes-api";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationStorageSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - List volumes in the uploads schema
export async function GET() {
  try {
    // Get the current session to find the active organization
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session" },
        { status: 401 }
      );
    }

    const activeOrgId = session.session.activeOrganizationId;

    // Get organization storage settings to find the catalog name
    const [storageSettings] = await db
      .select()
      .from(organizationStorageSettings)
      .where(eq(organizationStorageSettings.organizationId, activeOrgId))
      .limit(1);

    if (!storageSettings?.organizationEditableCatalog) {
      return NextResponse.json(
        { error: "No editable catalog configured for this organization" },
        { status: 400 }
      );
    }

    const catalogName = storageSettings.organizationEditableCatalog;
    const schemaName = "uploads";

    // List all volumes in the uploads schema
    const result = await listVolumesAll(catalogName, schemaName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    // Transform volumes to the frontend format
    const volumes = result.data.map((v: VolumeInfo) => ({
      name: v.name,
      fullName: v.full_name,
      type: v.volume_type,
      owner: v.owner || "Unknown",
      createdAt: v.created_at ? new Date(v.created_at).toISOString() : null,
      storageLocation: v.storage_location,
    }));

    return NextResponse.json({
      volumes,
      catalogName,
      schemaName,
    });
  } catch (error) {
    console.error("Error listing volumes:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Create a new volume
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, comment } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Volume name is required" },
        { status: 400 }
      );
    }

    // Get the current session to find the active organization
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session" },
        { status: 401 }
      );
    }

    const activeOrgId = session.session.activeOrganizationId;

    // Get organization storage settings to find the catalog name
    const [storageSettings] = await db
      .select()
      .from(organizationStorageSettings)
      .where(eq(organizationStorageSettings.organizationId, activeOrgId))
      .limit(1);

    if (!storageSettings?.organizationEditableCatalog) {
      return NextResponse.json(
        { error: "No editable catalog configured for this organization" },
        { status: 400 }
      );
    }

    const catalogName = storageSettings.organizationEditableCatalog;
    const schemaName = "uploads";

    // Create the managed volume
    const result = await createManagedVolume(catalogName, schemaName, name, comment);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    // Transform to frontend format
    const volume = {
      name: result.data.name,
      fullName: result.data.full_name,
      type: result.data.volume_type,
      owner: result.data.owner || "Unknown",
      createdAt: result.data.created_at ? new Date(result.data.created_at).toISOString() : null,
      storageLocation: result.data.storage_location,
    };

    return NextResponse.json({ volume });
  } catch (error) {
    console.error("Error creating volume:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
