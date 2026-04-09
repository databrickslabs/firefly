import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the X-API-Key header against GUEST_API_SECRET env var.
 * Returns null if valid, or a NextResponse error if invalid.
 */
export function validateGuestApiKey(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("X-API-Key");
  const expectedKey = process.env.GUEST_API_SECRET;

  if (!expectedKey) {
    console.error("[Guest API] GUEST_API_SECRET is not configured");
    return NextResponse.json(
      { error: "Guest API is not configured" },
      { status: 503 }
    );
  }

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized - Invalid API key" },
      { status: 401 }
    );
  }

  return null;
}
