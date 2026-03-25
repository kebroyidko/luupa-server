import { Hono } from "hono";
import { internalApp } from "./internal/index.js";
import { seedSuperuser } from "./db/seed.js";
import { serveStatic } from "hono/bun";

await seedSuperuser();

const app = new Hono();
app.route("/internal", internalApp);
app.use("/public/*", serveStatic({ root: "./" }));

export default { port: process.env.PORT || 3000, fetch: app.fetch };
