import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";
import { nanoid } from 'nanoid';

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

    const body = await request.json();
    const { workspacePath, sharedWithEmail, permissionLevel } = body;

    if (!workspacePath || !sharedWithEmail || !permissionLevel) {
      return NextResponse.json(
        { error: 'workspacePath, sharedWithEmail, and permissionLevel are required' },
        { status: 400 }
      );
    }

    if (permissionLevel !== 'CAN_READ' && permissionLevel !== 'CAN_EDIT') {
      return NextResponse.json(
        { error: 'permissionLevel must be CAN_READ or CAN_EDIT' },
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
    const { user, notebookMetadata, notebookShare } = await import('@/db/schema');
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

    // Get object_id from workspace path
    const statusResult = await callDatabricksApi({
      endpoint: "/api/2.0/workspace/get-status",
      method: "GET",
      queryParams: { path: workspacePath },
    });

    if (!statusResult.success) {
      return createErrorResponse(statusResult);
    }

    const statusData = statusResult.data as { object_id: number };
    const objectId = statusData.object_id.toString();
    const notebookName = workspacePath.split('/').pop() || 'Untitled';

    // Update Databricks permissions
    const permissionsResult = await callDatabricksApi({
      endpoint: `/api/2.0/permissions/notebooks/${objectId}`,
      method: "PATCH",
      body: {
        access_control_list: [
          {
            user_name: sharedWithEmail,
            permission_level: permissionLevel,
          },
        ],
      },
    });

    if (!permissionsResult.success) {
      return createErrorResponse(permissionsResult);
    }

    // Store or update notebook metadata
    const [existingMetadata] = await db
      .select()
      .from(notebookMetadata)
      .where(
        and(
          eq(notebookMetadata.organizationId, organizationId),
          eq(notebookMetadata.workspacePath, workspacePath)
        )
      )
      .limit(1);

    let metadataId: string;

    if (existingMetadata) {
      metadataId = existingMetadata.id;
      if (existingMetadata.objectId !== objectId) {
        await db
          .update(notebookMetadata)
          .set({ objectId, updatedAt: new Date() })
          .where(eq(notebookMetadata.id, existingMetadata.id));
      }
    } else {
      metadataId = nanoid();
      await db.insert(notebookMetadata).values({
        id: metadataId,
        organizationId,
        workspacePath,
        objectId,
        notebookName,
      });
    }

    // Store or update share record
    const [existingShare] = await db
      .select()
      .from(notebookShare)
      .where(
        and(
          eq(notebookShare.notebookMetadataId, metadataId),
          eq(notebookShare.sharedWithUserId, sharedWithUser.id)
        )
      )
      .limit(1);

    if (existingShare) {
      await db
        .update(notebookShare)
        .set({ permissionLevel, updatedAt: new Date() })
        .where(eq(notebookShare.id, existingShare.id));
    } else {
      await db.insert(notebookShare).values({
        id: nanoid(),
        notebookMetadataId: metadataId,
        sharedByUserId: session.user.id,
        sharedWithUserId: sharedWithUser.id,
        permissionLevel,
      });
    }

    // Invalidate caches
    const { revalidateTag } = await import('next/cache');
    const { NOTEBOOK_SHARES_CACHE_TAG } = await import('../notebook-shares/route');
    const { SHARED_NOTEBOOKS_CACHE_TAG } = await import('../shared-notebooks/route');
    revalidateTag(NOTEBOOK_SHARES_CACHE_TAG);
    revalidateTag(SHARED_NOTEBOOKS_CACHE_TAG);
    revalidateTag(`notebook-${workspacePath}`);

    return NextResponse.json({
      success: true,
      message: `Notebook shared with ${sharedWithEmail} with ${permissionLevel} permission`,
    });
  } catch (error) {
    console.error('Error sharing notebook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
