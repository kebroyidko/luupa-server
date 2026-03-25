import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";

export async function requireSuperuser(c, next) {
  const token = getCookie(c, "dashboard_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET, "HS256");
    c.set("superuser", payload);
    await next();
  } catch (e) {
    console.log("verify error:", e.message);
    return c.json({ error: "Invalid or expired session" }, 401);
  }
}
