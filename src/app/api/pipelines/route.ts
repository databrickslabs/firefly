import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache, revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { PIPELINES_CACHE_TAG } from './cache-tags';

// GET - List all pipelines (owned + shared with user)
export async function GET() {
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
    const { pipeline, pipelineShare, user } = await import('@/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    const getCachedPipelines = unstable_cache(
      async () => {
        // Get pipelines owned by user
        const ownedPipelines = await db
          .select({
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
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
              eq(pipeline.organizationId, organizationId),
              eq(pipeline.createdByUserId, session.user.id),
              isNull(pipeline.deletedAt)
            )
          );

        // Get pipelines shared with user
        const sharedPipelines = await db
          .select({
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
            createdAt: pipeline.createdAt,
            updatedAt: pipeline.updatedAt,
            createdByUserId: pipeline.createdByUserId,
            creatorName: user.name,
            creatorEmail: user.email,
            permissionLevel: pipelineShare.permissionLevel,
          })
          .from(pipelineShare)
          .innerJoin(pipeline, eq(pipelineShare.pipelineId, pipeline.id))
          .innerJoin(user, eq(pipeline.createdByUserId, user.id))
          .where(
            and(
              eq(pipelineShare.sharedWithUserId, session.user.id),
              eq(pipeline.organizationId, organizationId),
              isNull(pipeline.deletedAt)
            )
          );

        // Combine and format results
        const owned = ownedPipelines.map(p => ({
          ...p,
          accessType: 'owner' as const,
          permissionLevel: null as string | null,
        }));

        const shared = sharedPipelines.map(p => ({
          ...p,
          accessType: 'shared' as const,
        }));

        return [...owned, ...shared].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      },
      [`pipelines-list-${session.user.id}-${organizationId}`],
      {
        tags: [PIPELINES_CACHE_TAG, `user-${session.user.id}`],
        revalidate: false,
      }
    );

    const pipelines = await getCachedPipelines();
    return NextResponse.json({ pipelines });
  } catch (error) {
    console.error('Error fetching pipelines:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new pipeline
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, description, pipelineJson } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Pipeline name is required' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { pipeline } = await import('@/db/schema');

    const pipelineId = nanoid();
    const now = new Date();

    await db.insert(pipeline).values({
      id: pipelineId,
      organizationId,
      name,
      description: description || null,
      pipelineJson: pipelineJson || { nodes: [], edges: [] },
      createdByUserId: session.user.id,
      createdAt: now,
      updatedAt: now,
    });

    revalidateTag(PIPELINES_CACHE_TAG);

    return NextResponse.json({
      success: true,
      pipeline: {
        id: pipelineId,
        name,
        description,
      },
    });
  } catch (error) {
    console.error('Error creating pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
