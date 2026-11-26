CREATE TABLE "meal_plan" (
	"date" date PRIMARY KEY NOT NULL,
	"recipe_id" text,
	"recipe_slug" text,
	"recipe_name" text,
	"text" text,
	"cook_id" uuid,
	"servings" integer DEFAULT 4 NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_staples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "pantry_staples_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_cook_id_members_id_fk" FOREIGN KEY ("cook_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "pantry_staples" ("name", "variants") VALUES
('Salz', '["Meersalz", "Jodsalz"]'::jsonb),
('Pfeffer', '["schwarzer Pfeffer", "Pfeffer, schwarz"]'::jsonb),
('Zucker', '["weißer Zucker"]'::jsonb),
('Brauner Zucker', '[]'::jsonb),
('Puderzucker', '[]'::jsonb),
('Mehl', '["Weizenmehl", "Mehl Type 405"]'::jsonb),
('Speisestärke', '["Stärke", "Maisstärke"]'::jsonb),
('Backpulver', '[]'::jsonb),
('Natron', '[]'::jsonb),
('Hefe', '["Trockenhefe"]'::jsonb),
('Vanillezucker', '[]'::jsonb),
('Öl', '["Sonnenblumenöl", "Rapsöl", "Pflanzenöl", "Speiseöl"]'::jsonb),
('Olivenöl', '[]'::jsonb),
('Essig', '["Weißweinessig", "Branntweinessig"]'::jsonb),
('Balsamico', '["Balsamicoessig"]'::jsonb),
('Senf', '[]'::jsonb),
('Ketchup', '[]'::jsonb),
('Mayonnaise', '[]'::jsonb),
('Sojasauce', '["Sojasoße"]'::jsonb),
('Gemüsebrühe', '["Brühe", "Gemüsebrühe (Pulver)"]'::jsonb),
('Paprikapulver', '["Paprika edelsüß", "Paprika rosenscharf"]'::jsonb),
('Curry', '["Currypulver"]'::jsonb),
('Zimt', '[]'::jsonb),
('Muskat', '["Muskatnuss"]'::jsonb),
('Oregano', '[]'::jsonb),
('Basilikum, getrocknet', '[]'::jsonb),
('Thymian', '[]'::jsonb),
('Kreuzkümmel', '["Cumin"]'::jsonb),
('Chiliflocken', '["Chili"]'::jsonb),
('Lorbeerblatt', '["Lorbeerblätter"]'::jsonb),
('Knoblauch', '["Knoblauchzehe", "Knoblauchzehen"]'::jsonb),
('Zwiebel', '["Zwiebeln"]'::jsonb),
('Butter', '[]'::jsonb),
('Milch', '[]'::jsonb),
('Eier', '["Ei"]'::jsonb),
('Reis', '[]'::jsonb),
('Nudeln', '["Pasta", "Spaghetti"]'::jsonb),
('Honig', '[]'::jsonb),
('Tomatenmark', '[]'::jsonb),
('Wasser', '[]'::jsonb);
