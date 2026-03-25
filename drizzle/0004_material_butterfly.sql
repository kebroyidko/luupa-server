CREATE TYPE "public"."region" AS ENUM('Toshkent shahri', 'Andijon', 'Buxoro', 'Farg''ona', 'Jizzax', 'Namangan', 'Navoiy', 'Qashqadaryo', 'Samarqand', 'Sirdaryo', 'Surxondaryo', 'Toshkent', 'Xorazm', 'Qoraqalpog''iston Respublikasi');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('store', 'market');--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subscribers" integer DEFAULT 0,
	"profile_image" text,
	"link" text NOT NULL,
	"description" text,
	"region" "region",
	"type" "channel_type" NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "channels_link_unique" UNIQUE("link")
);
