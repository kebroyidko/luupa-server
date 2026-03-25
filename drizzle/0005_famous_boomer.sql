CREATE TYPE "public"."job_type" AS ENUM('channels', 'products', 'exchange_rates');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "job_type" NOT NULL,
	"total_processed" integer DEFAULT 0,
	"total_updated" integer DEFAULT 0,
	"total_failed" integer DEFAULT 0,
	"failures" json DEFAULT '[]'::json,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
