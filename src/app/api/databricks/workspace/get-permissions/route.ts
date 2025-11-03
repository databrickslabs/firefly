import { NextRequest, NextResponse } from 'next/server';
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const objectId = searchParams.get('objectId');

    if (!objectId) {
      return NextResponse.json(
        { error: 'objectId parameter is required' },
        { status: 400 }
      );
    }

    const result = await callDatabricksApi({
      endpoint: `/api/2.0/permissions/notebooks/${objectId}`,
      method: "GET",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error getting workspace permissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
