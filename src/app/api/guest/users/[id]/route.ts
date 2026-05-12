import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_USERS_CACHE_TAG } from '../../cache-tags';
import { ORGANIZATIONS_CACHE_TAG } from '@/lib/auth-dynamic';

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
    const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

    // Sign in with current credentials to get a session
    const signInResult = await auth.api.signInEmail({
      body: { email: guest.generatedEmail, password: guest.generatedPassword || '' },
    });

    if (!signInResult?.token) {
      return NextResponse.json(
        { error: 'Failed to create session for guest user' },
        { status: 500 }
      );
    }

    const sessionCookie = `better-auth.session_token=${signInResult.token}`;

    // Mint the OTT first — it's stored independently and won't be affected by password rotation
    const ottResult = await auth.api.generateOneTimeToken({
      headers: new Headers({ cookie: sessionCookie }),
    });
    if (!ottResult?.token) {
      return NextResponse.json(
        { error: 'Failed to generate one-time login token' },
        { status: 500 }
      );
    }

    // Rotate the password so any previous email/password URLs are immediately invalidated,
    // and revoke all existing sessions (guest will re-enter via the new OTT)
    const newPassword = nanoid(24);
    await auth.api.changePassword({
      body: {
        currentPassword: guest.generatedPassword || '',
        newPassword,
        revokeOtherSessions: true,
      },
      headers: new Headers({ cookie: sessionCookie }),
    });

    // Persist new password so future regenerations still work
    await db
      .update(guestUser)
      .set({ generatedPassword: newPassword, updatedAt: new Date() })
      .where(eq(guestUser.id, id));

    const loginUrl = `${appUrl}/guest-login?token=${encodeURIComponent(ottResult.token)}`;
    return NextResponse.json({ loginUrl, expiresIn: '10 minutes' });
  } catch (error) {
    console.error('Error regenerating guest login token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
