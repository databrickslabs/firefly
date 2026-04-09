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
    const orgSlug = `guest-${nanoid(16)}`;

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

    // Generate a one-time token for secure login (single-use, expires in 10 min)
    // The signUpResult contains the session token we need
    const sessionToken = signUpResult.token;
    let oneTimeTokenValue: string | null = null;
    const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

    if (sessionToken) {
      try {
        const ottResult = await auth.api.generateOneTimeToken({
          headers: new Headers({
            cookie: `better-auth.session_token=${sessionToken}`,
          }),
        });
        oneTimeTokenValue = ottResult?.token || null;
      } catch (err) {
        console.error('Error generating one-time token:', err);
      }
    }

    // Build login URL - prefer OTT, fallback to email/password
    let loginUrl: string;
    if (oneTimeTokenValue) {
      loginUrl = `${appUrl}/guest-login?token=${encodeURIComponent(oneTimeTokenValue)}`;
    } else {
      // Fallback: email/password URL (less secure but functional)
      loginUrl = `${appUrl}/guest-login?email=${encodeURIComponent(generatedEmail)}&p=${encodeURIComponent(generatedPassword)}`;
    }

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
    console.error('Error creating guest user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
