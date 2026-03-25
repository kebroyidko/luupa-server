CREATE TABLE "superusers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"active" boolean DEFAULT true,
	CONSTRAINT "superusers_email_unique" UNIQUE("email")
);
