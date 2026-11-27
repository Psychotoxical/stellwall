ALTER TABLE "members" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Members the administration already made pick an own password too; the first member set theirs at setup.
UPDATE "members" SET "must_change_password" = true WHERE "id" <> (SELECT "id" FROM "members" ORDER BY "created_at" LIMIT 1);
