import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { sign, decode } from "hono/jwt";
import { db } from "../../db/index.js";
import { superusers } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export const authRoutes = new Hono();

authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);

  const [user] = await db.select().from(superusers).where(eq(superusers.email, email));
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);

  const token = await sign(
    { id: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 },
    process.env.JWT_SECRET,
    "HS256"
  );

  setCookie(c, "dashboard_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  return c.json({ ok: true });
});

authRoutes.post("/logout", (c) => {
  setCookie(c, "dashboard_token", "", { httpOnly: true, maxAge: 0, path: "/" });
  return c.json({ ok: true });
});
