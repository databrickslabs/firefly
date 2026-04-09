import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// JWKS table — managed by the better-auth JWT plugin.
// Stores the asymmetric key pairs used to sign and verify JWTs.
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type Jwks = typeof jwks.$inferSelect;
export type InsertJwks = typeof jwks.$inferInsert;
