import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  console.log("=== SPN SESSION TEST ===");
  console.log("All cookies:", allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + "..." })));

  const sessionToken = cookieStore.get("better-auth.session_token")?.value;
  console.log("Session token from cookie:", sessionToken);

  if (sessionToken) {
    const sessions = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.token, sessionToken))
      .limit(1);

    console.log("Session from DB:", sessions[0] || "NOT FOUND");

    return NextResponse.json({
      cookiePresent: true,
      sessionToken,
      sessionInDb: sessions.length > 0,
      session: sessions[0] || null,
    });
  }

  return NextResponse.json({
    cookiePresent: false,
    allCookies: allCookies.map(c => c.name),
  });
}
