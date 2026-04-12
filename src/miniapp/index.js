import { Hono } from "hono";
import { requireMiniAppUser } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { searchRoutes } from "./routes/search.js";

export const miniApp = new Hono();

miniApp.use("/*", requireMiniAppUser);
miniApp.route("/auth", authRoutes);
miniApp.route("/search", searchRoutes);
