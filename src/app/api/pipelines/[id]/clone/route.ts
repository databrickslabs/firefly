import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { nanoid } from 'nanoid';
import { checkPipelineAccess } from '@/lib/pipeline-permissions';
import { PIPELINES_CACHE_TAG } from '../../cache-tags';

type RouteParams = { params: Promise<{ id: string }> };

// POST - Clone a pipeline
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

    // Check access - must be able to read to clone
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
    const { pipeline } = await import('@/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    // Get the original pipeline
    const [originalPipeline] = await db
      .select()
      .from(pipeline)
      .where(
        and(
          eq(pipeline.id, pipelineId),
          eq(pipeline.organizationId, organizationId),
          isNull(pipeline.deletedAt)
        )
      )
      .limit(1);

    if (!originalPipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    // Optionally get custom name from request body
    let body: { name?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, use default naming
    }

    const newPipelineId = nanoid();
    const now = new Date();
    const newName = body.name || `${originalPipeline.name} (Copy)`;

    // Create the clone
    await db.insert(pipeline).values({
      id: newPipelineId,
      organizationId,
      name: newName,
      description: originalPipeline.description,
      // Deep copy the pipeline JSON
      pipelineJson: JSON.parse(JSON.stringify(originalPipeline.pipelineJson)),
      createdByUserId: session.user.id, // Current user becomes owner
      createdAt: now,
      updatedAt: now,
    });

    revalidateTag(PIPELINES_CACHE_TAG);

    return NextResponse.json({
      success: true,
      pipeline: {
        id: newPipelineId,
        name: newName,
        description: originalPipeline.description,
      },
    });
  } catch (error) {
    console.error('Error cloning pipeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
