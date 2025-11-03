import { NextRequest, NextResponse } from 'next/server';
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json(
        { error: 'Path parameter is required' },
        { status: 400 }
      );
    }

    const result = await callDatabricksApi({
      endpoint: "/api/2.0/workspace/get-status",
      method: "GET",
      queryParams: { path },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error getting workspace object status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
