import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL || '';

// Create Neon HTTP client - optimized for serverless/edge environments
const sql = neon(databaseUrl);

// Create drizzle instance with schema for relational queries
export const db = drizzle(sql, { schema });

// Export schema for use in queries
export { schema };
