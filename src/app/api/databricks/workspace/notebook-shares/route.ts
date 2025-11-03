import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';

export const NOTEBOOK_SHARES_CACHE_TAG = 'notebook-shares';

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const workspacePath = searchParams.get('workspacePath');

    if (!workspacePath) {
      return NextResponse.json(
        { error: 'workspacePath parameter is required' },
        { status: 400 }
      );
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { notebookMetadata, notebookShare, user } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    const getNotebookShares = unstable_cache(
      async () => {
        // First, get the notebook metadata
        const [metadata] = await db
          .select()
          .from(notebookMetadata)
          .where(
            and(
              eq(notebookMetadata.organizationId, organizationId),
              eq(notebookMetadata.workspacePath, workspacePath)
            )
          )
          .limit(1);

        if (!metadata) {
          return { shares: [], metadata: null };
        }

        // Get all shares for this notebook
        const shares = await db
          .select({
            id: notebookShare.id,
            sharedWithUserId: notebookShare.sharedWithUserId,
            sharedWithName: user.name,
            sharedWithEmail: user.email,
            permissionLevel: notebookShare.permissionLevel,
            sharedAt: notebookShare.createdAt,
          })
          .from(notebookShare)
          .innerJoin(user, eq(notebookShare.sharedWithUserId, user.id))
          .where(eq(notebookShare.notebookMetadataId, metadata.id));

        return { shares, metadata };
      },
      [`notebook-shares-${organizationId}-${workspacePath}`],
      {
        tags: [NOTEBOOK_SHARES_CACHE_TAG, `notebook-${workspacePath}`],
        revalidate: false,
      }
    );

    const result = await getNotebookShares();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching notebook shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove a share
export async function DELETE(request: NextRequest) {
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

    const { shareId } = await request.json();

    if (!shareId) {
      return NextResponse.json(
        { error: 'shareId is required' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { notebookShare } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const { revalidateTag } = await import('next/cache');

    // Delete the share
    await db.delete(notebookShare).where(eq(notebookShare.id, shareId));

    // Invalidate caches
    const { SHARED_NOTEBOOKS_CACHE_TAG } = await import('../shared-notebooks/route');
    revalidateTag(NOTEBOOK_SHARES_CACHE_TAG);
    revalidateTag(SHARED_NOTEBOOKS_CACHE_TAG);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing notebook share:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
