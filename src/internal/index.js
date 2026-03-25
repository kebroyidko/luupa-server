import { Hono } from "hono";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sessionRoutes } from "./routes/sessions.js";
import { categoryRoutes } from "./routes/categories.js";
import { channelRoutes } from "./routes/channels.js";
import { requireSuperuser } from "./middleware/auth.js";
import { jobRoutes } from "./routes/jobs.js";

export const internalApp = new Hono();

internalApp.route("/auth", authRoutes);

internalApp.use("/dashboard/*", requireSuperuser);
internalApp.route("/dashboard", dashboardRoutes);
internalApp.route("/dashboard/sessions", sessionRoutes);
internalApp.route("/dashboard/categories", categoryRoutes);
internalApp.route("/dashboard/channels", channelRoutes);
internalApp.route("/dashboard/jobs", jobRoutes);
