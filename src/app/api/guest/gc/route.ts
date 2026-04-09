import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_USERS_CACHE_TAG } from '../cache-tags';
import { ORGANIZATIONS_CACHE_TAG } from '@/lib/auth-dynamic';

export const dynamic = 'force-dynamic';

const GC_BATCH_SIZE = 100;

// POST - Garbage collect expired guest users
export async function POST(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { db } = await import('@/db');
    const { guestUser, user, organization, userSpns } = await import('@/db/schema');
    const { eq, and, lte } = await import('drizzle-orm');

    // Find expired, non-cleaned-up guest records
    const expiredGuests = await db
      .select()
      .from(guestUser)
      .where(
        and(
          lte(guestUser.expiresAt, new Date()),
          eq(guestUser.isExpired, false)
        )
      )
      .limit(GC_BATCH_SIZE);

    let cleanedCount = 0;

    for (const guest of expiredGuests) {
      try {
        // Delete userSpns entry for this guest
        await db.delete(userSpns).where(eq(userSpns.email, guest.generatedEmail));

        // Delete user (cascades to sessions, accounts, members)
        await db.delete(user).where(eq(user.id, guest.userId));

        // Delete organization (cascades to BYOD entries, members)
        await db.delete(organization).where(eq(organization.id, guest.organizationId));

        // Mark guest record as cleaned up
        await db
          .update(guestUser)
          .set({
            isExpired: true,
            cleanedUpAt: new Date(),
          })
          .where(eq(guestUser.id, guest.id));

        cleanedCount++;
      } catch (err) {
        console.error(`Error cleaning up guest ${guest.id}:`, err);
        // Continue with next guest - don't let one failure stop the batch
      }
    }

    if (cleanedCount > 0) {
      revalidateTag(GUEST_USERS_CACHE_TAG);
      revalidateTag(ORGANIZATIONS_CACHE_TAG);
    }

    return NextResponse.json({
      success: true,
      cleaned: { count: cleanedCount },
      hasMore: expiredGuests.length === GC_BATCH_SIZE,
    });
  } catch (error) {
    console.error('Error running guest GC:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
