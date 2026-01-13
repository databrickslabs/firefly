CREATE TABLE "spn_auth"."userSpns" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"clientId" text NOT NULL,
	"clientSecret" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "userSpns_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "spn_user_spns_email_idx" ON "spn_auth"."userSpns" USING btree ("email");