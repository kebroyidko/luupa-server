import { Hono } from "hono";
import { requireMiniAppUser } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import savedRoutes from './routes/saved.js';
import { searchRoutes } from "./routes/search.js";
import { categoriesRoutes } from "./routes/categories.js";

export const miniApp = new Hono();

miniApp.use("/*", requireMiniAppUser);
miniApp.route("/auth", authRoutes);
miniApp.route("/search", searchRoutes);
miniApp.route("/saved", savedRoutes);
miniApp.route("/categories", categoriesRoutes);
