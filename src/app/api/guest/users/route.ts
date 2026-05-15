import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_USERS_CACHE_TAG } from '../cache-tags';
import { ORGANIZATIONS_CACHE_TAG } from '@/lib/auth-dynamic';

export const dynamic = 'force-dynamic';

// POST - Create a new guest user
export async function POST(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      name,
      email,
      password,
      orgName,
      spnId,
      expiresInMinutes = 60,
      displayName,
      customLogo,
    } = body;

    const MAX_EXPIRES_MINUTES = 30 * 24 * 60; // 30 days

    if (!orgName) {
      return NextResponse.json(
        { error: 'orgName is required' },
        { status: 400 }
      );
    }

    if (!spnId) {
      return NextResponse.json(
        { error: 'spnId is required (guest SPN ID)' },
        { status: 400 }
      );
    }

    if (expiresInMinutes > MAX_EXPIRES_MINUTES) {
      return NextResponse.json(
        { error: `expiresInMinutes cannot exceed ${MAX_EXPIRES_MINUTES} (30 days)` },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { organization, member, user, guestUser, guestSpns, guestWorkspaces, byodDatabricksSpns, byodDatabricksWorkspaces, userSpns } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const { getAuthInstance } = await import('@/lib/auth-dynamic');

    // Validate guest SPN exists
    const [existingSpn] = await db
      .select()
      .from(guestSpns)
      .where(eq(guestSpns.id, spnId))
      .limit(1);

    if (!existingSpn) {
      return NextResponse.json(
        { error: `Guest SPN with id '${spnId}' not found` },
        { status: 404 }
      );
    }

    // Validate guest workspace exists (use the workspace linked to the SPN)
    const [existingWorkspace] = await db
      .select()
      .from(guestWorkspaces)
      .where(eq(guestWorkspaces.id, existingSpn.guestWorkspaceId))
      .limit(1);

    if (!existingWorkspace) {
      return NextResponse.json(
        { error: `Guest workspace for SPN '${spnId}' not found` },
        { status: 404 }
      );
    }

    // Generate credentials (lowercase email to match better-auth normalization)
    const generatedEmail = (email || `guest_${nanoid(12)}@firefly-guest.local`).toLowerCase();
    const generatedPassword = password || nanoid(24);
    const guestName = name || 'Guest User';

    // Compute expiration
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Use better-auth to create user + account with hashed password
    const auth = await getAuthInstance();
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: guestName,
        email: generatedEmail,
        password: generatedPassword,
      },
    });

    if (!signUpResult?.user?.id) {
      return NextResponse.json(
        { error: 'Failed to create guest user account' },
        { status: 500 }
      );
    }

    const userId = signUpResult.user.id;

    // Update user role to 'guest'
    await db
      .update(user)
      .set({ role: 'guest' })
      .where(eq(user.id, userId));

    // Create temporary organization
    const orgId = `org_guest_${Date.now()}_${nanoid(8)}`;
    const slugBase = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'demo';
    const orgSlug = `${slugBase}-${nanoid(6)}`;

    await db.insert(organization).values({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      ssoEnabled: false,
      workspaceUrl: existingWorkspace.workspaceUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create member (guest is owner of their temp org)
    await db.insert(member).values({
      id: nanoid(),
      organizationId: orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Clone BYOD SPN entry into temp org so existing SPN resolution works
    const clonedSpnId = nanoid();
    await db.insert(byodDatabricksSpns).values({
      id: clonedSpnId,
      organizationId: orgId,
      name: existingSpn.name,
      clientId: existingSpn.clientId,
      clientSecret: existingSpn.clientSecret,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Clone BYOD workspace entry into temp org
    await db.insert(byodDatabricksWorkspaces).values({
      id: nanoid(),
      organizationId: orgId,
      workspaceUrl: existingWorkspace.workspaceUrl,
      spnId: clonedSpnId,
      name: existingWorkspace.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create guestUser tracking record
    const guestId = `guest_${nanoid()}`;
    await db.insert(guestUser).values({
      id: guestId,
      userId,
      organizationId: orgId,
      spnId,
      workspaceId: existingSpn.guestWorkspaceId,
      expiresAt,
      generatedEmail,
      generatedPassword,
      displayName: displayName || null,
      customLogo: customLogo || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create userSpns entry so getDatabricksSpnToken() resolves for this guest
    await db.insert(userSpns).values({
      id: nanoid(),
      email: generatedEmail,
      clientId: existingSpn.clientId,
      clientSecret: existingSpn.clientSecret,
      principalId: 0,
      workspaceUrl: existingWorkspace.workspaceUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Generate a one-time token for secure login (single-use, expires in 10 min).
    // signUpEmail called server-side doesn't return a session token, so we explicitly
    // sign in to obtain one, then use it to generate the OTT.
    const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

    const signInResult = await auth.api.signInEmail({
      body: {
        email: generatedEmail,
        password: generatedPassword,
      },
    });

    const sessionToken = signInResult?.token;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Guest user created but failed to obtain session token for login link generation' },
        { status: 500 }
      );
    }

    const ottResult = await auth.api.generateOneTimeToken({
      headers: new Headers({
        cookie: `better-auth.session_token=${sessionToken}`,
      }),
    });

    const oneTimeTokenValue = ottResult?.token;
    if (!oneTimeTokenValue) {
      return NextResponse.json(
        { error: 'Guest user created but failed to generate one-time login token' },
        { status: 500 }
      );
    }

    const loginUrl = `${appUrl}/guest-login?token=${encodeURIComponent(oneTimeTokenValue)}`;

    revalidateTag(GUEST_USERS_CACHE_TAG);
    revalidateTag(ORGANIZATIONS_CACHE_TAG);

    return NextResponse.json(
      {
        guestUser: {
          id: guestId,
          userId,
          organizationId: orgId,
          email: generatedEmail,
          loginUrl,
          expiresAt: expiresAt.toISOString(),
          orgName,
          orgSlug,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating guest user:', message, error);
    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 }
    );
  }
}

// GET - List guest users
export async function GET(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';

    const { db } = await import('@/db');
    const { guestUser, organization } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const getCachedGuests = unstable_cache(
      async () => {
        let whereClause;

        if (status === 'active') {
          whereClause = eq(guestUser.isExpired, false);
        } else if (status === 'expired') {
          whereClause = eq(guestUser.isExpired, true);
        }

        const guests = await db
          .select({
            id: guestUser.id,
            userId: guestUser.userId,
            organizationId: guestUser.organizationId,
            email: guestUser.generatedEmail,
            displayName: guestUser.displayName,
            expiresAt: guestUser.expiresAt,
            isExpired: guestUser.isExpired,
            cleanedUpAt: guestUser.cleanedUpAt,
            createdAt: guestUser.createdAt,
            orgName: organization.name,
            orgSlug: organization.slug,
          })
          .from(guestUser)
          .leftJoin(organization, eq(guestUser.organizationId, organization.id))
          .where(whereClause)
          .orderBy(guestUser.createdAt);

        // Mark any as effectively expired if past expiresAt
        const now = new Date();
        return guests.map(g => ({
          ...g,
          isEffectivelyExpired: g.isExpired || new Date(g.expiresAt) < now,
        }));
      },
      [`guest-users-list-${status}`],
      {
        tags: [GUEST_USERS_CACHE_TAG],
        revalidate: false,
      }
    );

    const guests = await getCachedGuests();
    return NextResponse.json({ guests });
  } catch (error) {
    console.error('Error listing guest users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
