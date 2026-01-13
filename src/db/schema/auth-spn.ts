import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

// User SPNs table - maps users (by email) to service principal credentials
export const userSpns = pgTable('userSpns', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(), // User email
  clientId: text('clientId').notNull(), // SPN client ID
  clientSecret: text('clientSecret').notNull(), // SPN client secret
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  // Index for querying by email
  emailIdx: index('user_spns_email_idx').on(table.email),
}));

// Type inference
export type UserSpn = typeof userSpns.$inferSelect;
export type InsertUserSpn = typeof userSpns.$inferInsert;
