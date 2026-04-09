import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { validateGuestApiKey } from '@/lib/guest-api-auth';
import { GUEST_WORKSPACES_CACHE_TAG, GUEST_SPNS_CACHE_TAG } from '../../cache-tags';

export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// DELETE - Delete a guest workspace (cascades to its SPNs)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = validateGuestApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    const { db } = await import('@/db');
    const { guestWorkspaces } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const [existing] = await db
      .select()
      .from(guestWorkspaces)
      .where(eq(guestWorkspaces.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Guest workspace not found' }, { status: 404 });
    }

    await db.delete(guestWorkspaces).where(eq(guestWorkspaces.id, id));

    revalidateTag(GUEST_WORKSPACES_CACHE_TAG);
    revalidateTag(GUEST_SPNS_CACHE_TAG);

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting guest workspace:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
