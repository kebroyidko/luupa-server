import { pgTable, serial, text, timestamp, boolean, integer, pgEnum, json } from "drizzle-orm/pg-core";

export const superusers = pgTable("superusers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  active: boolean("active").default(true),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  session: text("session").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  thumbnail: text("thumbnail"),
  isActive: boolean("is_active").default(true),
  metaFields: json("meta_fields").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const regionEnum = pgEnum("region", [
  "Toshkent shahri", "Andijon", "Buxoro", "Farg'ona", "Jizzax",
  "Namangan", "Navoiy", "Qashqadaryo", "Samarqand", "Sirdaryo",
  "Surxondaryo", "Toshkent", "Xorazm", "Qoraqalpog'iston Respublikasi",
]);

export const typeEnum = pgEnum("channel_type", ["store", "market"]);

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subscribers: integer("subscribers").default(0),
  profileImage: text("profile_image"),
  link: text("link").notNull().unique(),
  description: text("description"),
  region: regionEnum("region"),
  type: typeEnum("type").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobTypeEnum = pgEnum("job_type", ["channels", "products", "exchange_rates"]);

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  type: jobTypeEnum("type").notNull(),
  totalProcessed: integer("total_processed").default(0),
  totalUpdated: integer("total_updated").default(0),
  totalFailed: integer("total_failed").default(0),
  failures: json("failures").default([]),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name"),
  price: json("price"),
  description: text("description"),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  postId: integer("post_id").notNull(),
  media: json("media").default([]),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  meta: json("meta").default({}),
  isSold: boolean("is_sold").default(false),
  wasDeletedFromChannel: boolean("was_deleted_from_channel").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  allowsWriteToPm: boolean("allows_write_to_pm").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
