ALTER TABLE "session" ADD COLUMN "impersonatedBy" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banReason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banExpires" timestamp;