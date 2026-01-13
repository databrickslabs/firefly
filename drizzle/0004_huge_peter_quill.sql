CREATE SCHEMA "spn_auth";
--> statement-breakpoint
CREATE TABLE "spn_auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"inviterId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."notebookMetadata" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"workspacePath" text NOT NULL,
	"objectId" text NOT NULL,
	"notebookName" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."notebookShare" (
	"id" text PRIMARY KEY NOT NULL,
	"notebookMetadataId" text NOT NULL,
	"sharedByUserId" text NOT NULL,
	"sharedWithUserId" text NOT NULL,
	"permissionLevel" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."oauthFlowMapping" (
	"key" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"workspaceUrl" text,
	"ssoEnabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeOrganizationId" text,
	"impersonatedBy" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."ssoProvider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"domain" text NOT NULL,
	"oidcConfig" text,
	"samlConfig" text,
	"userId" text NOT NULL,
	"providerId" text NOT NULL,
	"organizationId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ssoProvider_providerId_unique" UNIQUE("providerId")
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"accountIdUserIdMapping" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean,
	"banReason" text,
	"banExpires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "spn_auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spn_auth"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."invitation" ADD CONSTRAINT "invitation_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."invitation" ADD CONSTRAINT "invitation_inviterId_user_id_fk" FOREIGN KEY ("inviterId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."member" ADD CONSTRAINT "member_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."member" ADD CONSTRAINT "member_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."notebookMetadata" ADD CONSTRAINT "notebookMetadata_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."notebookShare" ADD CONSTRAINT "notebookShare_notebookMetadataId_notebookMetadata_id_fk" FOREIGN KEY ("notebookMetadataId") REFERENCES "spn_auth"."notebookMetadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."notebookShare" ADD CONSTRAINT "notebookShare_sharedByUserId_user_id_fk" FOREIGN KEY ("sharedByUserId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."notebookShare" ADD CONSTRAINT "notebookShare_sharedWithUserId_user_id_fk" FOREIGN KEY ("sharedWithUserId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."oauthFlowMapping" ADD CONSTRAINT "oauthFlowMapping_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."session" ADD CONSTRAINT "session_activeOrganizationId_organization_id_fk" FOREIGN KEY ("activeOrganizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."ssoProvider" ADD CONSTRAINT "ssoProvider_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "spn_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spn_auth"."ssoProvider" ADD CONSTRAINT "ssoProvider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "spn_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spn_notebook_unique_org_object_id" ON "spn_auth"."notebookMetadata" USING btree ("organizationId","objectId");--> statement-breakpoint
CREATE UNIQUE INDEX "spn_notebook_unique_org_path" ON "spn_auth"."notebookMetadata" USING btree ("organizationId","workspacePath");--> statement-breakpoint
CREATE UNIQUE INDEX "spn_notebook_share_unique_notebook_user" ON "spn_auth"."notebookShare" USING btree ("notebookMetadataId","sharedWithUserId");--> statement-breakpoint
CREATE INDEX "spn_notebook_share_shared_with_idx" ON "spn_auth"."notebookShare" USING btree ("sharedWithUserId");--> statement-breakpoint
CREATE INDEX "spn_notebook_share_notebook_idx" ON "spn_auth"."notebookShare" USING btree ("notebookMetadataId");--> statement-breakpoint
CREATE INDEX "spn_oauth_flow_created_at_idx" ON "spn_auth"."oauthFlowMapping" USING btree ("createdAt");