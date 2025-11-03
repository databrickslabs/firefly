DROP INDEX "notebook_org_path_idx";--> statement-breakpoint
DROP INDEX "notebook_object_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_unique_org_object_id" ON "notebookMetadata" USING btree ("organizationId","objectId");--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_unique_org_path" ON "notebookMetadata" USING btree ("organizationId","workspacePath");--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_share_unique_notebook_user" ON "notebookShare" USING btree ("notebookMetadataId","sharedWithUserId");