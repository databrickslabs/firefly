import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache, revalidateTag } from 'next/cache';
import { checkPipelineAccess } from '@/lib/pipeline-permissions';
import { PIPELINES_CACHE_TAG, PIPELINE_SHARES_CACHE_TAG } from '../../cache-tags';

type RouteParams = { params: Promise<{ id: string }> };

// GET - Get all shares for a pipeline
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session || !session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const { id: pipelineId } = await params;

    // Check access - must be owner to view shares
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Access denied: only the owner can view shares' },
        { status: 403 }
      );
    }

    const { db } = await import('@/db');
    const { pipelineShare, user } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const getCachedShares = unstable_cache(
      async () => {
        const shares = await db
          .select({
            id: pipelineShare.id,
            permissionLevel: pipelineShare.permissionLevel,
            createdAt: pipelineShare.createdAt,
            updatedAt: pipelineShare.updatedAt,
            sharedWithUserId: pipelineShare.sharedWithUserId,
            sharedWithEmail: user.email,
            sharedWithName: user.name,
          })
          .from(pipelineShare)
          .innerJoin(user, eq(pipelineShare.sharedWithUserId, user.id))
          .where(eq(pipelineShare.pipelineId, pipelineId));

        return shares;
      },
      [`pipeline-shares-${pipelineId}`],
      {
        tags: [PIPELINE_SHARES_CACHE_TAG, `pipeline-${pipelineId}`],
        revalidate: false,
      }
    );

    const shares = await getCachedShares();
    return NextResponse.json({ shares });
  } catch (error) {
    console.error('Error fetching pipeline shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a share
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session || !session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const { id: pipelineId } = await params;

    const { searchParams } = new URL(request.url);
    const sharedWithUserId = searchParams.get('sharedWithUserId');

    if (!sharedWithUserId) {
      return NextResponse.json(
        { error: 'sharedWithUserId query parameter is required' },
        { status: 400 }
      );
    }

    // Check access - must be owner to remove shares
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Access denied: only the owner can remove shares' },
        { status: 403 }
      );
    }

    const { db } = await import('@/db');
    const { pipelineShare } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    await db
      .delete(pipelineShare)
      .where(
        and(
          eq(pipelineShare.pipelineId, pipelineId),
          eq(pipelineShare.sharedWithUserId, sharedWithUserId)
        )
      );

    revalidateTag(PIPELINES_CACHE_TAG);
    revalidateTag(PIPELINE_SHARES_CACHE_TAG);
    revalidateTag(`pipeline-${pipelineId}`);

    return NextResponse.json({
      success: true,
      message: 'Share removed successfully',
    });
  } catch (error) {
    console.error('Error removing pipeline share:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
