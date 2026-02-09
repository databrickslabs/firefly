import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { organization, user } from './auth';

// Authoring tool types
export type AuthoringToolType = 'MARIMO' | 'CODE_SERVER';

// Backing compute types (for now just APP, CLUSTER can be added later)
export type AuthoringToolBackingType = 'APP' | 'CLUSTER';

// Authoring tool status
export type AuthoringToolStatus = 'CREATING' | 'STARTING' | 'RUNNING' | 'STOPPED' | 'ERROR' | 'DELETING';

// Authoring tools table - stores IDE/notebook environment definitions
export const authoringTool = pgTable('authoringTool', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().$type<AuthoringToolType>(), // MARIMO or CODE_SERVER
  backingType: text('backingType').notNull().$type<AuthoringToolBackingType>().default('APP'), // APP or CLUSTER

  // Databricks App details (when backingType is APP)
  appId: text('appId'), // Databricks app unique identifier
  appName: text('appName'), // Databricks app name (unique in workspace)
  appUrl: text('appUrl'), // The URL of the deployed app
  appStatus: text('appStatus'), // Current status from Databricks

  // Databricks Cluster details (when backingType is CLUSTER) - for future use
  clusterId: text('clusterId'),
  clusterName: text('clusterName'),

  // Volume path for file backup/storage
  volumePath: text('volumePath'), // Full path to volume e.g. /Volumes/catalog/schema/volume_name

  status: text('status').notNull().$type<AuthoringToolStatus>().default('CREATING'),
  statusMessage: text('statusMessage'), // Error message or additional status info

  createdByUserId: text('createdByUserId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deletedAt'), // Soft delete support
}, (table) => ({
  orgIdx: index('authoring_tool_org_idx').on(table.organizationId),
  creatorIdx: index('authoring_tool_creator_idx').on(table.createdByUserId),
  typeIdx: index('authoring_tool_type_idx').on(table.type),
}));

// Type inference
export type AuthoringTool = typeof authoringTool.$inferSelect;
export type InsertAuthoringTool = typeof authoringTool.$inferInsert;
