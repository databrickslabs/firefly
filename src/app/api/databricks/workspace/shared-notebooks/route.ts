import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';

export const SHARED_NOTEBOOKS_CACHE_TAG = 'shared-notebooks';

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

    const getSharedNotebooks = unstable_cache(
      async () => {
        const sharedNotebooks = await db
          .select({
            id: notebookMetadata.id,
            workspacePath: notebookMetadata.workspacePath,
            objectId: notebookMetadata.objectId,
            notebookName: notebookMetadata.notebookName,
            permissionLevel: notebookShare.permissionLevel,
            sharedAt: notebookShare.createdAt,
            sharedByEmail: user.email,
            sharedByName: user.name,
          })
          .from(notebookShare)
          .innerJoin(
            notebookMetadata,
            eq(notebookShare.notebookMetadataId, notebookMetadata.id)
          )
          .innerJoin(user, eq(notebookShare.sharedByUserId, user.id))
          .where(
            and(
              eq(notebookShare.sharedWithUserId, session.user.id),
              eq(notebookMetadata.organizationId, organizationId)
            )
          );

        return sharedNotebooks;
      },
      [`shared-notebooks-${session.user.id}-${organizationId}`],
      {
        tags: [SHARED_NOTEBOOKS_CACHE_TAG, `user-${session.user.id}`],
        revalidate: false,
      }
    );

    const sharedNotebooks = await getSharedNotebooks();
    return NextResponse.json({ notebooks: sharedNotebooks });
  } catch (error) {
    console.error('Error fetching shared notebooks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
