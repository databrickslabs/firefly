import { NextResponse } from "next/server";
import { uploadFile, deleteFile, downloadFile } from "@/lib/databricks-files-api";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationStorageSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Helper to get org storage settings
async function getOrgStorageSettings() {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.session?.activeOrganizationId) {
    return { error: "No active organization in session", status: 401 };
  }

  const activeOrgId = session.session.activeOrganizationId;

  const [storageSettings] = await db
    .select()
    .from(organizationStorageSettings)
    .where(eq(organizationStorageSettings.organizationId, activeOrgId))
    .limit(1);

  if (!storageSettings?.organizationEditableCatalog) {
    return { error: "No editable catalog configured for this organization", status: 400 };
  }

  return {
    catalogName: storageSettings.organizationEditableCatalog,
    schemaName: "uploads",
  };
}

// GET - Download a file
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
        { status: 400 }
      );
    }

    const orgSetup = await getOrgStorageSettings();
    if ("error" in orgSetup) {
      return NextResponse.json(
        { error: orgSetup.error },
        { status: orgSetup.status }
      );
    }

    const { catalogName, schemaName } = orgSetup;

    // Build the full path: /Volumes/catalog/schema/path
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${path}`;

    // Download the file
    const result = await downloadFile(fullPath);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    // Return the file as a binary response
    const fileName = path.split("/").pop() || "download";

    return new NextResponse(result.data.data, {
      headers: {
        "Content-Type": result.data.metadata.contentType,
        "Content-Length": String(result.data.metadata.contentLength),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Last-Modified": result.data.metadata.lastModified,
      },
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Upload a file
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const path = formData.get("path") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!path) {
      return NextResponse.json(
        { error: "Path is required" },
        { status: 400 }
      );
    }

    const orgSetup = await getOrgStorageSettings();
    if ("error" in orgSetup) {
      return NextResponse.json(
        { error: orgSetup.error },
        { status: orgSetup.status }
      );
    }

    const { catalogName, schemaName } = orgSetup;

    // Build the full path: /Volumes/catalog/schema/path/filename
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${path}/${file.name}`;

    // Convert file to ArrayBuffer
    const content = await file.arrayBuffer();

    // Upload the file
    const result = await uploadFile(fullPath, content, true);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    // Return the file info
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase()
      : undefined;

    return NextResponse.json({
      file: {
        name: file.name,
        path: `${path}/${file.name}`,
        isDirectory: false,
        size: file.size,
        modifiedAt: new Date().toISOString(),
        type: ext,
      },
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Delete a file
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

    const orgSetup = await getOrgStorageSettings();
    if ("error" in orgSetup) {
      return NextResponse.json(
        { error: orgSetup.error },
        { status: orgSetup.status }
      );
    }

    const { catalogName, schemaName } = orgSetup;

    // Build the full path: /Volumes/catalog/schema/path
    const fullPath = `/Volumes/${catalogName}/${schemaName}/${path}`;

    // Delete the file
    const result = await deleteFile(fullPath);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
