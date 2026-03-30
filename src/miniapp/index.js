import { Hono } from "hono";
import { requireMiniAppUser } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";

export const miniApp = new Hono();

miniApp.use("/*", requireMiniAppUser);
miniApp.route("/auth", authRoutes);
