import { NextResponse } from "next/server";
import { createDirectory, deleteDirectoryRecursive } from "@/lib/databricks-files-api";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationStorageSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST - Create a directory
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path } = body;

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
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

    // Build the full path: /Volumes/catalog/schema/path
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${path}`;

    // Create the directory
    const result = await createDirectory(fullPath);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, path });
  } catch (error) {
    console.error("Error creating directory:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Delete a directory (and its contents)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
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

    // Build the full path: /Volumes/catalog/schema/path
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${path}`;

    // Delete the directory recursively
    const result = await deleteDirectoryRecursive(fullPath);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting directory:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
