import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth';
import { user } from './auth';
import type { PipelineNode, PipelineEdge } from '@/stores/pipeline-store';

// Pipeline JSON structure
export interface PipelineJson {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

// Permission levels for pipeline sharing
export type PipelinePermissionLevel = 'CAN_READ' | 'CAN_EDIT' | 'CAN_RUN';

// Pipeline table - stores pipeline definitions
export const pipeline = pgTable('pipeline', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  pipelineJson: jsonb('pipelineJson').notNull().$type<PipelineJson>(),
  createdByUserId: text('createdByUserId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deletedAt'), // Soft delete support
}, (table) => ({
  orgIdx: index('pipeline_org_idx').on(table.organizationId),
  creatorIdx: index('pipeline_creator_idx').on(table.createdByUserId),
}));

// Pipeline shares table - tracks which users have access to which pipelines
export const pipelineShare = pgTable('pipelineShare', {
  id: text('id').primaryKey(),
  pipelineId: text('pipelineId').notNull().references(() => pipeline.id, { onDelete: 'cascade' }),
  sharedByUserId: text('sharedByUserId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sharedWithUserId: text('sharedWithUserId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  permissionLevel: text('permissionLevel').notNull().$type<PipelinePermissionLevel>(), // CAN_READ, CAN_EDIT, CAN_RUN
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Unique constraint: can't share same pipeline with same user twice
  uniquePipelineUser: uniqueIndex('pipeline_share_unique').on(table.pipelineId, table.sharedWithUserId),
  // Index for querying pipelines shared with a user
  sharedWithIdx: index('pipeline_share_user_idx').on(table.sharedWithUserId),
  // Index for querying who a pipeline is shared with
  pipelineIdx: index('pipeline_share_pipeline_idx').on(table.pipelineId),
}));

// Type inference
export type Pipeline = typeof pipeline.$inferSelect;
export type InsertPipeline = typeof pipeline.$inferInsert;

export type PipelineShare = typeof pipelineShare.$inferSelect;
export type InsertPipelineShare = typeof pipelineShare.$inferInsert;
