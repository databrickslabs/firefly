import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_SPNS_CACHE_TAG } from '../cache-tags';

export const dynamic = 'force-dynamic';

// GET - List all guest SPNs (with workspace info)
export async function GET(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { db } = await import('@/db');
    const { guestSpns, guestWorkspaces } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const getCachedSpns = unstable_cache(
      async () => {
        return db
          .select({
            id: guestSpns.id,
            name: guestSpns.name,
            clientId: guestSpns.clientId,
            guestWorkspaceId: guestSpns.guestWorkspaceId,
            workspaceName: guestWorkspaces.name,
            workspaceUrl: guestWorkspaces.workspaceUrl,
            createdAt: guestSpns.createdAt,
          })
          .from(guestSpns)
          .leftJoin(guestWorkspaces, eq(guestSpns.guestWorkspaceId, guestWorkspaces.id))
          .orderBy(guestSpns.createdAt);
      },
      ['guest-spns-list'],
      { tags: [GUEST_SPNS_CACHE_TAG], revalidate: false }
    );

    const spns = await getCachedSpns();
    return NextResponse.json({ spns });
  } catch (error) {
    console.error('Error listing guest SPNs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a guest SPN (mapped to a guest workspace)
export async function POST(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, clientId, clientSecret, guestWorkspaceId } = body;

    if (!name || !clientId || !clientSecret || !guestWorkspaceId) {
      return NextResponse.json(
        { error: 'name, clientId, clientSecret, and guestWorkspaceId are required' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { guestSpns, guestWorkspaces } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    // Validate workspace exists
    const [workspace] = await db
      .select()
      .from(guestWorkspaces)
      .where(eq(guestWorkspaces.id, guestWorkspaceId))
      .limit(1);

    if (!workspace) {
      return NextResponse.json(
        { error: `Guest workspace '${guestWorkspaceId}' not found` },
        { status: 404 }
      );
    }

    const id = nanoid();
    await db.insert(guestSpns).values({
      id,
      name,
      clientId,
      clientSecret,
      guestWorkspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidateTag(GUEST_SPNS_CACHE_TAG);

    return NextResponse.json(
      { spn: { id, name, clientId, guestWorkspaceId } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating guest SPN:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
