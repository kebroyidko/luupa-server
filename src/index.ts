import { Hono } from "hono";
import { cors } from "hono/cors";
import { internalApp } from "./internal/index.js";
import { miniApp } from "./miniapp/index.js";
import { botRoutes } from "./bot/index.js";
import { seedSuperuser } from "./db/seed.js";
import { serveStatic } from "hono/bun";

await seedSuperuser();

const app = new Hono();

app.use("/miniapp/*", cors({
  origin: ["http://localhost:5174", process.env.MINIAPP_URL ?? ""].filter(Boolean),
  allowHeaders: ["x-init-data", "Content-Type"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
}));

app.route("/miniapp", miniApp);
app.route("/internal", internalApp);
app.route("/bot", botRoutes);
app.use("/public/*", serveStatic({ root: "./" }));

export default { port: process.env.PORT || 3000, fetch: app.fetch, idleTimeout: 120 };
