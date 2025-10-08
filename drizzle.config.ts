import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env.local file
config({ path: '.env.local' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
