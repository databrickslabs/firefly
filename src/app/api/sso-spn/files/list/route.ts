import { NextResponse } from "next/server";
import { listDirectoryAll } from "@/lib/databricks-files-api";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationStorageSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - List files in a directory
// Query params: path (the path relative to the volume, e.g., "volume_name" or "volume_name/folder")
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relativePath = searchParams.get("path");

    if (!relativePath) {
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
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${relativePath}`;

    // List directory contents
    const result = await listDirectoryAll(fullPath);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    // Transform to frontend format
    const files = result.data.map((entry) => {
      // Get file extension for non-directories
      const ext = !entry.is_directory && entry.name.includes(".")
        ? entry.name.split(".").pop()?.toLowerCase()
        : undefined;

      return {
        name: entry.name,
        path: relativePath + "/" + entry.name,
        isDirectory: entry.is_directory,
        size: entry.file_size,
        modifiedAt: entry.last_modified ? new Date(entry.last_modified).toISOString() : null,
        type: ext,
      };
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Error listing files:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
