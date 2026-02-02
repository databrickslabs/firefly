import { db } from '@/db';
import { pipeline, pipelineShare, type PipelinePermissionLevel } from '@/db/schema/pipelines';
import { eq, and, isNull } from 'drizzle-orm';

export type { PipelinePermissionLevel } from '@/db/schema/pipelines';

export interface PipelineAccess {
  canRead: boolean;
  canEdit: boolean;
  canRun: boolean;
  isOwner: boolean;
  permissionLevel: PipelinePermissionLevel | null;
}

/**
 * Check a user's access to a pipeline
 * Returns null if the pipeline doesn't exist or doesn't belong to the organization
 */
export async function checkPipelineAccess(
  pipelineId: string,
  userId: string,
  organizationId: string
): Promise<PipelineAccess | null> {
  // First, get the pipeline and verify it belongs to the organization
  const pipelineRecord = await db
    .select({
      id: pipeline.id,
      createdByUserId: pipeline.createdByUserId,
      deletedAt: pipeline.deletedAt,
    })
    .from(pipeline)
    .where(
      and(
        eq(pipeline.id, pipelineId),
        eq(pipeline.organizationId, organizationId),
        isNull(pipeline.deletedAt) // Exclude soft-deleted pipelines
      )
    )
    .limit(1);

  if (pipelineRecord.length === 0) {
    return null;
  }

  const isOwner = pipelineRecord[0].createdByUserId === userId;

  // Owners have full access
  if (isOwner) {
    return {
      canRead: true,
      canEdit: true,
      canRun: true,
      isOwner: true,
      permissionLevel: null, // Owners don't have a permission level, they have full access
    };
  }

  // Check for shared access
  const shareRecord = await db
    .select({
      permissionLevel: pipelineShare.permissionLevel,
    })
    .from(pipelineShare)
    .where(
      and(
        eq(pipelineShare.pipelineId, pipelineId),
        eq(pipelineShare.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (shareRecord.length === 0) {
    // No access
    return {
      canRead: false,
      canEdit: false,
      canRun: false,
      isOwner: false,
      permissionLevel: null,
    };
  }

  const permissionLevel = shareRecord[0].permissionLevel as PipelinePermissionLevel;

  // Permission level mapping:
  // CAN_READ: can view only
  // CAN_EDIT: can read, edit, and run
  // CAN_RUN: can read and run (no edit)
  return {
    canRead: true, // All shared users can read
    canEdit: permissionLevel === 'CAN_EDIT',
    canRun: permissionLevel === 'CAN_EDIT' || permissionLevel === 'CAN_RUN',
    isOwner: false,
    permissionLevel,
  };
}

/**
 * Require a specific permission level, throwing an error if not met
 */
export async function requirePipelineAccess(
  pipelineId: string,
  userId: string,
  organizationId: string,
  requiredPermission: 'read' | 'edit' | 'run' | 'delete'
): Promise<PipelineAccess> {
  const access = await checkPipelineAccess(pipelineId, userId, organizationId);

  if (!access) {
    throw new Error('Pipeline not found');
  }

  const hasPermission =
    (requiredPermission === 'read' && access.canRead) ||
    (requiredPermission === 'edit' && access.canEdit) ||
    (requiredPermission === 'run' && access.canRun) ||
    (requiredPermission === 'delete' && access.isOwner);

  if (!hasPermission) {
    throw new Error(`Insufficient permission: requires ${requiredPermission} access`);
  }

  return access;
}
