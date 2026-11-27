CREATE TABLE "document_members" (
	"document_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "document_members_document_id_member_id_pk" PRIMARY KEY("document_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"valid_until" date,
	"remind_days" integer DEFAULT 30 NOT NULL,
	"everyone" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"pages" integer,
	"ocr_state" text DEFAULT 'pending' NOT NULL,
	"ocr_tries" integer DEFAULT 0 NOT NULL,
	"text" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('german', coalesce(name, '')), 'A') || setweight(to_tsvector('german', coalesce(category, '')), 'B') || setweight(to_tsvector('german', coalesce(text, '')), 'C')) STORED,
	"search_plain" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(text, ''))) STORED
);
--> statement-breakpoint
ALTER TABLE "document_members" ADD CONSTRAINT "document_members_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_members" ADD CONSTRAINT "document_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_search_idx" ON "documents" USING gin ("search");--> statement-breakpoint
CREATE INDEX "documents_search_plain_idx" ON "documents" USING gin ("search_plain");