import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

// Helper function to extract SCIM ID from accountIdUserIdMapping
function getScimId(accountIdUserIdMapping?: string | null): string | null {
  if (!accountIdUserIdMapping) return null;

  try {
    const mapping = JSON.parse(accountIdUserIdMapping);
    const accountId = process.env.DATABRICKS_ACCOUNT_ID;

    if (!accountId) return null;

    return mapping[accountId] || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Not authorized. Admin role required." },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");
    const searchValue = searchParams.get("searchValue") || undefined;

    // Use admin API to list users
    const result = await auth.api.listUsers({
      headers: await headers(),
      query: {
        limit,
        offset,
        searchValue,
        sortBy: "email",
        sortDirection: "asc",
      },
    });

    if (!result) {
      throw new Error("Failed to fetch users");
    }

    // Add SCIM ID to each user and sort by email
    const usersWithScimId = result.users.map((user: unknown) => {
      const userObj = user as { accountIdUserIdMapping?: string; email: string };
      return {
        ...userObj,
        scimId: getScimId(userObj.accountIdUserIdMapping),
        // Remove the mapping from the response to avoid leaking account ID
        accountIdUserIdMapping: undefined,
      };
    });

    // Sort by email on the server side
    usersWithScimId.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({
      users: usersWithScimId,
      total: result.total,
    });
  } catch (error) {
    console.error("Error listing users with SCIM:", error);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}
