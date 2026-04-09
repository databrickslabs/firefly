import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_WORKSPACES_CACHE_TAG } from '../cache-tags';

export const dynamic = 'force-dynamic';

// GET - List all guest workspaces
export async function GET(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { db } = await import('@/db');
    const { guestWorkspaces } = await import('@/db/schema');

    const getCachedWorkspaces = unstable_cache(
      async () => {
        return db.select().from(guestWorkspaces).orderBy(guestWorkspaces.createdAt);
      },
      ['guest-workspaces-list'],
      { tags: [GUEST_WORKSPACES_CACHE_TAG], revalidate: false }
    );

    const workspaces = await getCachedWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Error listing guest workspaces:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a guest workspace
export async function POST(request: NextRequest) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, workspaceUrl } = body;

    if (!name || !workspaceUrl) {
      return NextResponse.json(
        { error: 'name and workspaceUrl are required' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { guestWorkspaces } = await import('@/db/schema');

    const id = nanoid();
    await db.insert(guestWorkspaces).values({
      id,
      name,
      workspaceUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidateTag(GUEST_WORKSPACES_CACHE_TAG);

    return NextResponse.json(
      { workspace: { id, name, workspaceUrl } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating guest workspace:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
