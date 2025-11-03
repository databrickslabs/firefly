CREATE TABLE "notebookMetadata" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"workspacePath" text NOT NULL,
	"objectId" text NOT NULL,
	"notebookName" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebookShare" (
	"id" text PRIMARY KEY NOT NULL,
	"notebookMetadataId" text NOT NULL,
	"sharedByUserId" text NOT NULL,
	"sharedWithUserId" text NOT NULL,
	"permissionLevel" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notebookMetadata" ADD CONSTRAINT "notebookMetadata_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebookShare" ADD CONSTRAINT "notebookShare_notebookMetadataId_notebookMetadata_id_fk" FOREIGN KEY ("notebookMetadataId") REFERENCES "public"."notebookMetadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebookShare" ADD CONSTRAINT "notebookShare_sharedByUserId_user_id_fk" FOREIGN KEY ("sharedByUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebookShare" ADD CONSTRAINT "notebookShare_sharedWithUserId_user_id_fk" FOREIGN KEY ("sharedWithUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebook_org_path_idx" ON "notebookMetadata" USING btree ("organizationId","workspacePath");--> statement-breakpoint
CREATE INDEX "notebook_object_id_idx" ON "notebookMetadata" USING btree ("objectId");--> statement-breakpoint
CREATE INDEX "notebook_share_shared_with_idx" ON "notebookShare" USING btree ("sharedWithUserId");--> statement-breakpoint
CREATE INDEX "notebook_share_notebook_idx" ON "notebookShare" USING btree ("notebookMetadataId");