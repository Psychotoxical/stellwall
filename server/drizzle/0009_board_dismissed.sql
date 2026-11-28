CREATE TABLE "board_dismissed" (
	"member_id" uuid NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "board_dismissed_member_id_key_pk" PRIMARY KEY("member_id","key")
);
--> statement-breakpoint
ALTER TABLE "board_dismissed" ADD CONSTRAINT "board_dismissed_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;