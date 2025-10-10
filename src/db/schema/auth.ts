import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

// User table - core authentication
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
  accountIdUserIdMapping: text('accountIdUserIdMapping'), // JSON string mapping Databricks account ID to SCIM user ID
});

// Session table
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('activeOrganizationId').references(() => organization.id, { onDelete: 'set null' }),
});

// Account table - for OAuth and password authentication
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Verification table - for email verification and password reset
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Organization table
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  workspaceUrl: text('workspaceUrl'),
  ssoEnabled: boolean('ssoEnabled').notNull().default(true), // SSO enabled by default
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Member table - links users to organizations
export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // e.g., 'owner', 'admin', 'member'
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// Invitation table - for inviting users to organizations
export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(), // 'pending', 'accepted', 'rejected'
  expiresAt: timestamp('expiresAt').notNull(),
  inviterId: text('inviterId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// SSO Provider table - for storing SSO provider configurations
export const ssoProvider = pgTable('ssoProvider', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  domain: text('domain').notNull(),
  oidcConfig: text('oidcConfig'), // JSON string for OIDC configuration
  samlConfig: text('samlConfig'), // JSON string for SAML configuration
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  providerId: text('providerId').notNull().unique(),
  organizationId: text('organizationId').references(() => organization.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
});

// OAuth flow mapping - stores session token OR authorization code to organization
// Starts as sessionToken, then gets updated to code when callback happens
export const oauthFlowMapping = pgTable('oauthFlowMapping', {
  key: text('key').primaryKey(), // Session token initially, then authorization code
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  // Index for cleanup queries by timestamp
  createdAtIdx: index('oauth_flow_created_at_idx').on(table.createdAt),
}));

// Type inference
export type User = typeof user.$inferSelect;
export type InsertUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type InsertSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type InsertAccount = typeof account.$inferInsert;

export type Organization = typeof organization.$inferSelect;
export type InsertOrganization = typeof organization.$inferInsert;

export type Member = typeof member.$inferSelect;
export type InsertMember = typeof member.$inferInsert;

export type Invitation = typeof invitation.$inferSelect;
export type InsertInvitation = typeof invitation.$inferInsert;

export type SsoProvider = typeof ssoProvider.$inferSelect;
export type InsertSsoProvider = typeof ssoProvider.$inferInsert;

export type OauthFlowMapping = typeof oauthFlowMapping.$inferSelect;
export type InsertOauthFlowMapping = typeof oauthFlowMapping.$inferInsert;
