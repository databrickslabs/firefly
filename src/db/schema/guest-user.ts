import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { user, organization } from './auth';

// Guest Workspaces - global table shared by all guest users (not org-scoped)
export const guestWorkspaces = pgTable('guestWorkspaces', {
  id: text('id').primaryKey(),
  workspaceUrl: text('workspaceUrl').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Guest SPNs - global table shared by all guest users, mapped to a specific guest workspace
export const guestSpns = pgTable('guestSpns', {
  id: text('id').primaryKey(),
  guestWorkspaceId: text('guestWorkspaceId').notNull().references(() => guestWorkspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  clientId: text('clientId').notNull(),
  clientSecret: text('clientSecret').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  workspaceIdx: index('guest_spns_workspace_idx').on(table.guestWorkspaceId),
}));

// Guest user tracking table - links a real user row to a temporary organization
// with expiration, SPN mapping, and future customization fields
export const guestUser = pgTable('guestUser', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // SPN + Workspace mapping (references guest-specific tables)
  spnId: text('spnId').notNull().references(() => guestSpns.id, { onDelete: 'restrict' }),
  workspaceId: text('workspaceId').notNull().references(() => guestWorkspaces.id, { onDelete: 'restrict' }),

  // Expiration
  expiresAt: timestamp('expiresAt').notNull(),
  isExpired: boolean('isExpired').notNull().default(false),
  cleanedUpAt: timestamp('cleanedUpAt'),

  // Login credentials
  generatedEmail: text('generatedEmail').notNull(),
  generatedPassword: text('generatedPassword'),

  // Future customization fields
  customLogo: text('customLogo'),
  displayName: text('displayName'),
  customMetadata: text('customMetadata'), // JSON string for theme/branding

  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userIdx: index('guest_user_user_idx').on(table.userId),
  orgIdx: index('guest_user_org_idx').on(table.organizationId),
  expiresAtIdx: index('guest_user_expires_at_idx').on(table.expiresAt),
  isExpiredIdx: index('guest_user_is_expired_idx').on(table.isExpired),
}));

// Type inference
export type GuestWorkspace = typeof guestWorkspaces.$inferSelect;
export type InsertGuestWorkspace = typeof guestWorkspaces.$inferInsert;

export type GuestSpn = typeof guestSpns.$inferSelect;
export type InsertGuestSpn = typeof guestSpns.$inferInsert;

export type GuestUser = typeof guestUser.$inferSelect;
export type InsertGuestUser = typeof guestUser.$inferInsert;
