import { pgTable, text, timestamp, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { organization } from './auth';

// Organization Setup table - stores Unity Catalog configuration for each organization
export const organizationSetup = pgTable('organizationSetup', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  catalogName: text('catalogName'),
  volumeName: text('volumeName'),
  groupName: text('groupName'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Each organization can only have one setup configuration
  uniqueOrgSetup: uniqueIndex('organization_setup_unique_org').on(table.organizationId),
}));

// Type inference
export type OrganizationSetup = typeof organizationSetup.$inferSelect;
export type InsertOrganizationSetup = typeof organizationSetup.$inferInsert;

// Organization Storage Settings table - stores storage configuration for each organization
export const organizationStorageSettings = pgTable('organizationStorageSettings', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  primaryOrganizationGroup: text('primaryOrganizationGroup').notNull(),
  primaryOrganizationGroupId: text('primaryOrganizationGroupId').notNull(),
  organizationEditableCatalog: text('organizationEditableCatalog').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Each organization can only have one storage settings configuration
  uniqueOrgStorageSettings: uniqueIndex('organization_storage_settings_unique_org').on(table.organizationId),
}));

// Type inference
export type OrganizationStorageSettings = typeof organizationStorageSettings.$inferSelect;
export type InsertOrganizationStorageSettings = typeof organizationStorageSettings.$inferInsert;
