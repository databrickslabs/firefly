import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_USERS_CACHE_TAG } from '../../cache-tags';
import { ORGANIZATIONS_CACHE_TAG, APP_URL } from '@/lib/auth-dynamic';

export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET - Get a single guest user by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    const { db } = await import('@/db');
    const { guestUser, organization } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const [guest] = await db
      .select({
        id: guestUser.id,
        userId: guestUser.userId,
        organizationId: guestUser.organizationId,
        email: guestUser.generatedEmail,
        displayName: guestUser.displayName,
        customLogo: guestUser.customLogo,
        customMetadata: guestUser.customMetadata,
        expiresAt: guestUser.expiresAt,
        isExpired: guestUser.isExpired,
        cleanedUpAt: guestUser.cleanedUpAt,
        spnId: guestUser.spnId,
        workspaceId: guestUser.workspaceId,
        createdAt: guestUser.createdAt,
        updatedAt: guestUser.updatedAt,
        orgName: organization.name,
        orgSlug: organization.slug,
      })
      .from(guestUser)
      .leftJoin(organization, eq(guestUser.organizationId, organization.id))
      .where(eq(guestUser.id, id))
      .limit(1);

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest user not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ guest });
  } catch (error) {
    console.error('Error fetching guest user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Regenerate a one-time login token for an existing guest user
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    const { db } = await import('@/db');
    const { guestUser } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const { getAuthInstance } = await import('@/lib/auth-dynamic');
    const { nanoid } = await import('nanoid');
    const { and, ne } = await import('drizzle-orm');

    // Find the guest record
    const [guest] = await db
      .select()
      .from(guestUser)
      .where(eq(guestUser.id, id))
      .limit(1);

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest user not found' },
        { status: 404 }
      );
    }

    if (guest.isExpired || new Date(guest.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Guest user has expired' },
        { status: 410 }
      );
    }

    const auth = await getAuthInstance();
    const internalHeaders = new Headers({ origin: APP_URL });

    // Sign in to create a fresh session, then mint an OTT by writing directly to the
    // verification table — mirroring exactly what better-auth's oneTimeToken plugin does
    // internally (storeToken:"hashed", SHA-256 + base64url).
    const signInResult = await auth.api.signInEmail({
      body: { email: guest.generatedEmail, password: guest.generatedPassword || '' },
      headers: internalHeaders,
    });

    if (!signInResult?.token) {
      return NextResponse.json(
        { error: 'Failed to create session for guest user' },
        { status: 500 }
      );
    }

    // Replicate oneTimeToken plugin (storeToken:"hashed"): random token → SHA-256 → base64url
    const { createHash } = await import('@better-auth/utils/hash');
    const { base64Url } = await import('@better-auth/utils/base64');
    const { verification, session: sessionTable } = await import('@/db/schema');
    const ottRaw = nanoid(32);
    const ottHash = base64Url.encode(
      new Uint8Array(await createHash('SHA-256').digest(new TextEncoder().encode(ottRaw))),
      { padding: false }
    );

    // Revoke all previous browser sessions for this guest (they must re-enter via the new OTT)
    await db.delete(sessionTable).where(
      and(eq(sessionTable.userId, guest.userId), ne(sessionTable.token, signInResult.token))
    );

    // Mint the OTT
    await db.insert(verification).values({
      id: nanoid(),
      identifier: `one-time-token:${ottHash}`,
      value: signInResult.token,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginUrl = `${APP_URL}/guest-login?token=${encodeURIComponent(ottRaw)}`;
    return NextResponse.json({ loginUrl, expiresIn: '10 minutes' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error regenerating guest login token:', message, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { detail: message }),
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a guest user and clean up associated resources
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    const { db } = await import('@/db');
    const { guestUser, user, organization, userSpns } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    // Find the guest record
    const [guest] = await db
      .select()
      .from(guestUser)
      .where(eq(guestUser.id, id))
      .limit(1);

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest user not found' },
        { status: 404 }
      );
    }

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
      .where(eq(guestUser.id, id));

    revalidateTag(GUEST_USERS_CACHE_TAG);
    revalidateTag(ORGANIZATIONS_CACHE_TAG);

    return NextResponse.json({
      success: true,
      deleted: {
        guestId: id,
        userId: guest.userId,
        organizationId: guest.organizationId,
      },
    });
  } catch (error) {
    console.error('Error deleting guest user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
