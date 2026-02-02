import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { checkPipelineAccess, type PipelinePermissionLevel } from '@/lib/pipeline-permissions';
import { PIPELINES_CACHE_TAG, PIPELINE_SHARES_CACHE_TAG } from '../../cache-tags';

type RouteParams = { params: Promise<{ id: string }> };

// POST - Share a pipeline with a user
export async function POST(request: NextRequest, { params }: RouteParams) {
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
    const body = await request.json();
    const { sharedWithEmail, permissionLevel } = body as {
      sharedWithEmail?: string;
      permissionLevel?: string;
    };

    if (!sharedWithEmail || !permissionLevel) {
      return NextResponse.json(
        { error: 'sharedWithEmail and permissionLevel are required' },
        { status: 400 }
      );
    }

    const validPermissions: PipelinePermissionLevel[] = ['CAN_READ', 'CAN_EDIT', 'CAN_RUN'];
    if (!validPermissions.includes(permissionLevel as PipelinePermissionLevel)) {
      return NextResponse.json(
        { error: 'permissionLevel must be CAN_READ, CAN_EDIT, or CAN_RUN' },
        { status: 400 }
      );
    }

    // Check access - must be owner to share
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Access denied: only the owner can share a pipeline' },
        { status: 403 }
      );
    }

    const { db } = await import('@/db');
    const { user, pipelineShare } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Find the user to share with
    const [sharedWithUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, sharedWithEmail))
      .limit(1);

    if (!sharedWithUser) {
      return NextResponse.json(
        { error: `User with email ${sharedWithEmail} not found` },
        { status: 404 }
      );
    }

    // Can't share with yourself
    if (sharedWithUser.id === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot share pipeline with yourself' },
        { status: 400 }
      );
    }

    // Check if already shared
    const [existingShare] = await db
      .select()
      .from(pipelineShare)
      .where(
        and(
          eq(pipelineShare.pipelineId, pipelineId),
          eq(pipelineShare.sharedWithUserId, sharedWithUser.id)
        )
      )
      .limit(1);

    if (existingShare) {
      // Update existing share
      await db
        .update(pipelineShare)
        .set({
          permissionLevel: permissionLevel as PipelinePermissionLevel,
          updatedAt: new Date(),
        })
        .where(eq(pipelineShare.id, existingShare.id));
    } else {
      // Create new share
      await db.insert(pipelineShare).values({
        id: nanoid(),
        pipelineId,
        sharedByUserId: session.user.id,
        sharedWithUserId: sharedWithUser.id,
        permissionLevel: permissionLevel as PipelinePermissionLevel,
      });
    }

    revalidateTag(PIPELINES_CACHE_TAG);
    revalidateTag(PIPELINE_SHARES_CACHE_TAG);
    revalidateTag(`pipeline-${pipelineId}`);

    return NextResponse.json({
      success: true,
      message: `Pipeline shared with ${sharedWithEmail} with ${permissionLevel} permission`,
    });
  } catch (error) {
    console.error('Error sharing pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
