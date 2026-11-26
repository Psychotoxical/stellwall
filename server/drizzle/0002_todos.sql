CREATE TABLE "todo_assignees" (
	"todo_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "todo_assignees_todo_id_member_id_pk" PRIMARY KEY("todo_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "todo_done" (
	"todo_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"done_by" uuid NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	CONSTRAINT "todo_done_todo_id_occurrence_date_pk" PRIMARY KEY("todo_id","occurrence_date")
);
--> statement-breakpoint
CREATE TABLE "todo_members" (
	"todo_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "todo_members_todo_id_member_id_pk" PRIMARY KEY("todo_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"key" text NOT NULL,
	"everyone" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"rule_changed_at" timestamp with time zone NOT NULL,
	"start_date" date,
	"time" text,
	"recurrence" jsonb NOT NULL,
	"until" date,
	"needs_confirm" boolean DEFAULT false NOT NULL,
	"reminders" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DROP INDEX "catalog_scope_key";--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "kind" text DEFAULT 'shopping' NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_assigned_by_members_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_done" ADD CONSTRAINT "todo_done_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_done" ADD CONSTRAINT "todo_done_done_by_members_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_members" ADD CONSTRAINT "todo_members_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_members" ADD CONSTRAINT "todo_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_kind_scope_key" ON "catalog_entries" USING btree ("kind","scope","key");