import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache, revalidateTag } from 'next/cache';
import { checkPipelineAccess } from '@/lib/pipeline-permissions';
import { PIPELINES_CACHE_TAG, PIPELINE_SHARES_CACHE_TAG } from '../cache-tags';

type RouteParams = { params: Promise<{ id: string }> };

// GET - Get a single pipeline by ID
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

    // Check access
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.canRead) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const { db } = await import('@/db');
    const { pipeline, user } = await import('@/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    const getCachedPipeline = unstable_cache(
      async () => {
        const [pipelineData] = await db
          .select({
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
            pipelineJson: pipeline.pipelineJson,
            createdAt: pipeline.createdAt,
            updatedAt: pipeline.updatedAt,
            createdByUserId: pipeline.createdByUserId,
            creatorName: user.name,
            creatorEmail: user.email,
          })
          .from(pipeline)
          .innerJoin(user, eq(pipeline.createdByUserId, user.id))
          .where(
            and(
              eq(pipeline.id, pipelineId),
              eq(pipeline.organizationId, organizationId),
              isNull(pipeline.deletedAt)
            )
          )
          .limit(1);

        return pipelineData;
      },
      [`pipeline-${pipelineId}`],
      {
        tags: [PIPELINES_CACHE_TAG, `pipeline-${pipelineId}`],
        revalidate: false,
      }
    );

    const pipelineData = await getCachedPipeline();

    if (!pipelineData) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pipeline: {
        ...pipelineData,
        access,
      },
    });
  } catch (error) {
    console.error('Error fetching pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a pipeline
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    // Check access
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.canEdit) {
      return NextResponse.json(
        { error: 'Access denied: requires edit permission' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, pipelineJson } = body;

    const { db } = await import('@/db');
    const { pipeline } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (pipelineJson !== undefined) updateData.pipelineJson = pipelineJson;

    await db
      .update(pipeline)
      .set(updateData)
      .where(eq(pipeline.id, pipelineId));

    revalidateTag(PIPELINES_CACHE_TAG);
    revalidateTag(`pipeline-${pipelineId}`);

    return NextResponse.json({
      success: true,
      message: 'Pipeline updated successfully',
    });
  } catch (error) {
    console.error('Error updating pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft delete a pipeline (owner only)
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

    // Check access - only owner can delete
    const access = await checkPipelineAccess(pipelineId, session.user.id, organizationId);
    if (!access) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Access denied: only the owner can delete a pipeline' },
        { status: 403 }
      );
    }

    const { db } = await import('@/db');
    const { pipeline } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    // Soft delete by setting deletedAt
    await db
      .update(pipeline)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pipeline.id, pipelineId));

    revalidateTag(PIPELINES_CACHE_TAG);
    revalidateTag(PIPELINE_SHARES_CACHE_TAG);
    revalidateTag(`pipeline-${pipelineId}`);

    return NextResponse.json({
      success: true,
      message: 'Pipeline deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
