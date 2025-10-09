import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

export const dynamic = "force-dynamic";

/**
 * Returns the complete user data including email, workspace URL, and organization info
 * This endpoint is used to initialize the global user store
 */
export async function GET() {
  try {
    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    return NextResponse.json({ data: tokenResult.data });
  } catch (error) {
    console.error("Error getting user data:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
