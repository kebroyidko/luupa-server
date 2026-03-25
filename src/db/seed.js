import { db } from "./index.js";
import { superusers } from "./schema.js";
import { eq } from "drizzle-orm";

export async function seedSuperuser() {
  const email = process.env.SUPERUSER_MAIL;
  const password = process.env.SUPERUSER_PASSWORD;

  if (!email || !password) throw new Error("SUPERUSER_MAIL and SUPERUSER_PASSWORD must be set");

  const existing = await db.select().from(superusers).where(eq(superusers.email, email));
  if (existing.length > 0) return;

  const hashed = await Bun.password.hash(password);
  await db.insert(superusers).values({ email, password: hashed });
  console.log("Superuser created:", email);
}
