import { NextResponse } from "next/server";
import { deleteVolume, getVolume } from "@/lib/databricks-volumes-api";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationStorageSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - Get a specific volume
export async function GET(
  request: Request,
  { params }: { params: Promise<{ volumeName: string }> }
) {
  try {
    const { volumeName } = await params;

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
    const fullName = `${catalogName}.${schemaName}.${volumeName}`;

    // Get the volume
    const result = await getVolume(fullName);

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
    console.error("Error getting volume:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Delete a volume
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ volumeName: string }> }
) {
  try {
    const { volumeName } = await params;

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
    const fullName = `${catalogName}.${schemaName}.${volumeName}`;

    // Delete the volume
    const result = await deleteVolume(fullName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting volume:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
