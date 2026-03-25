import { Hono } from "hono";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/me", (c) => {
  const superuser = c.get("superuser");
  return c.json({ id: superuser.id, email: superuser.email });
});
