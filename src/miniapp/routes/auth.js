import { Hono } from "hono";

export const authRoutes = new Hono();

authRoutes.get("/me", (c) => {
  const user = c.get("user");
  return c.json(user);
});
