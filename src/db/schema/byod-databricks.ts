import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth';

// BYOD Databricks Service Principals - stores SPN credentials for an organization
export const byodDatabricksSpns = pgTable('byodDatabricksSpns', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // A friendly name for the SPN
  clientId: text('clientId').notNull(), // SPN client ID
  clientSecret: text('clientSecret').notNull(), // SPN client secret (encrypted in practice)
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Index for querying by organization
  orgIdx: index('byod_spns_org_idx').on(table.organizationId),
  // Unique constraint: one clientId per organization
  uniqueOrgClientId: uniqueIndex('byod_spns_unique_org_client_id').on(table.organizationId, table.clientId),
}));

// BYOD Databricks Workspaces - maps workspace URLs to SPNs
export const byodDatabricksWorkspaces = pgTable('byodDatabricksWorkspaces', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  workspaceUrl: text('workspaceUrl').notNull(), // Databricks workspace URL
  spnId: text('spnId').notNull().references(() => byodDatabricksSpns.id, { onDelete: 'cascade' }), // The SPN to use for this workspace
  name: text('name'), // Optional friendly name for the workspace
  deltaSharingGlobalMetastoreId: text('deltaSharingGlobalMetastoreId'), // Global metastore ID for Delta Sharing
  deltaSharingOrganizationName: text('deltaSharingOrganizationName'), // Organization name for Delta Sharing
  deltaSharingScope: text('deltaSharingScope'), // Scope for Delta Sharing (e.g., 'INTERNAL', 'INTERNAL_AND_EXTERNAL')
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Index for querying by organization
  orgIdx: index('byod_workspaces_org_idx').on(table.organizationId),
  // Index for querying workspaces by SPN
  spnIdx: index('byod_workspaces_spn_idx').on(table.spnId),
  // Unique constraint: one workspace URL per organization
  uniqueOrgWorkspace: uniqueIndex('byod_workspaces_unique_org_url').on(table.organizationId, table.workspaceUrl),
}));

// BYOD Databricks Metastores - manually configured metastores
export const byodDatabricksMetastores = pgTable('byodDatabricksMetastores', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  globalMetastoreId: text('globalMetastoreId').notNull(), // The global metastore identifier (e.g., aws:us-west-2:abc123)
  name: text('name').notNull(), // Friendly name for the metastore
  sharingOrganizationName: text('sharingOrganizationName'), // Delta sharing organization name
  scope: text('scope'), // Delta sharing scope (e.g., 'INTERNAL', 'INTERNAL_AND_EXTERNAL')
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Index for querying by organization
  orgIdx: index('byod_metastores_org_idx').on(table.organizationId),
  // Unique constraint: one global metastore ID per organization
  uniqueOrgMetastore: uniqueIndex('byod_metastores_unique_org_global_id').on(table.organizationId, table.globalMetastoreId),
}));

// BYOD Databricks Sharing Catalogs - cached catalog mappings for provider/share combinations
export const byodDatabricksSharingCatalogs = pgTable('byodDatabricksSharingCatalogs', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  providerName: text('providerName').notNull(), // The name of the delta sharing provider
  shareName: text('shareName').notNull(), // The name of the share
  catalogName: text('catalogName').notNull(), // The name of the catalog in the local metastore
  catalogType: text('catalogType'), // e.g., 'DELTASHARING_CATALOG'
  metastoreId: text('metastoreId'), // The metastore ID where this catalog exists
  isValid: text('isValid').notNull().default('pending'), // 'valid', 'invalid', 'pending' - validation status
  lastValidatedAt: timestamp('lastValidatedAt'), // When the catalog was last validated
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Index for querying by organization
  orgIdx: index('byod_sharing_catalogs_org_idx').on(table.organizationId),
  // Index for querying by provider and share
  providerShareIdx: index('byod_sharing_catalogs_provider_share_idx').on(table.organizationId, table.providerName, table.shareName),
  // Unique constraint: one catalog per provider/share/catalog combination per organization
  uniqueOrgProviderShareCatalog: uniqueIndex('byod_sharing_catalogs_unique').on(table.organizationId, table.providerName, table.shareName, table.catalogName),
}));

// Type inference
export type ByodDatabricksSpn = typeof byodDatabricksSpns.$inferSelect;
export type InsertByodDatabricksSpn = typeof byodDatabricksSpns.$inferInsert;

export type ByodDatabricksWorkspace = typeof byodDatabricksWorkspaces.$inferSelect;
export type InsertByodDatabricksWorkspace = typeof byodDatabricksWorkspaces.$inferInsert;

export type ByodDatabricksMetastore = typeof byodDatabricksMetastores.$inferSelect;
export type InsertByodDatabricksMetastore = typeof byodDatabricksMetastores.$inferInsert;

export type ByodDatabricksSharingCatalog = typeof byodDatabricksSharingCatalogs.$inferSelect;
export type InsertByodDatabricksSharingCatalog = typeof byodDatabricksSharingCatalogs.$inferInsert;
