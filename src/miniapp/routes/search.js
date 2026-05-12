import { Hono } from "hono";
import { db } from "../../db/index.js";
import { products, channels } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export const searchRoutes = new Hono();

const SIMILARITY_THRESHOLD = 0.15;
const KEYWORD_THRESHOLD = 0.1;

const VALID_REGIONS = [
  "Andijon", "Buxoro", "Farg'ona", "Jizzax",
  "Namangan", "Navoiy", "Qashqadaryo", "Samarqand", "Sirdaryo",
  "Surxondaryo", "Toshkent", "Xorazm", "Qoraqalpog'iston Respublikasi"
];

searchRoutes.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const page = Number(c.req.query("page") ?? 0);
  const limit = Number(c.req.query("limit") ?? 15);
  const offset = page * limit;
  const region = c.req.query("region")?.trim();
  const sortBy = c.req.query("sort")?.trim();

  if (!q || q.length < 2) return c.json([]);

  const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);

  let orderByClause;
  if (sortBy === "cheap") {
    orderByClause = sql`CAST(REGEXP_REPLACE(p.price::text, '[^0-9.]', '', 'g') AS NUMERIC) ASC NULLS LAST, score DESC, p.telegram_date DESC NULLS LAST`;
  } else if (sortBy === "expensive") {
    orderByClause = sql`CAST(REGEXP_REPLACE(p.price::text, '[^0-9.]', '', 'g') AS NUMERIC) DESC NULLS LAST, score DESC, p.telegram_date DESC NULLS LAST`;
  } else {
    orderByClause = sql`score DESC, p.telegram_date DESC NULLS LAST`;
  }

  const regionCondition = region && region !== "all" && VALID_REGIONS.includes(region)
    ? sql`AND (ch.region = ${region} OR ch.region IS NULL)`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.price,
      p.description,
      p.media,
      p.post_id AS "postId",
      p.channel_id AS "channelId",
      p.telegram_date AS "telegramDate",
      ch.name AS "channelName",
      ch.link AS "channelLink",
      ch.telegram_id AS "channelTelegramId",
      ch.profile_image AS "channelProfileImage",
      ch.region AS "channelRegion",
      (
        CASE WHEN LOWER(p.name) = LOWER(${q}) OR LOWER(ch.name) = LOWER(${q}) THEN 3
             WHEN LOWER(p.name) LIKE ${`%${q}%`} OR LOWER(ch.name) LIKE ${`%${q}%`} THEN 2.5
             WHEN (
               ${keywords.length > 1 ? sql`(${sql.join(keywords.map(k => sql`(LOWER(p.name) LIKE ${`%${k}%`} OR LOWER(ch.name) LIKE ${`%${k}%`})`), sql` AND `)})` : sql`(LOWER(p.name) LIKE ${`%${keywords[0]}%`} OR LOWER(ch.name) LIKE ${`%${keywords[0]}%`})`}
             ) THEN 2
             WHEN similarity(p.name, ${q}) > ${SIMILARITY_THRESHOLD}
               OR similarity(ch.name, ${q}) > ${SIMILARITY_THRESHOLD} THEN
               GREATEST(similarity(p.name, ${q}), similarity(ch.name, ${q})) + 1
             ELSE 0
        END
      ) AS score
    FROM products p
    INNER JOIN channels ch ON p.channel_id = ch.id
    WHERE
      p.is_sold = false
      AND p.was_deleted_from_channel = false
      AND ch.is_active = true
      ${regionCondition}
      AND (
        LOWER(p.name) LIKE ${`%${q}%`}
        OR LOWER(ch.name) LIKE ${`%${q}%`}
        OR (${keywords.length > 1 ? sql`(${sql.join(keywords.map(k => sql`(LOWER(p.name) LIKE ${`%${k}%`} OR LOWER(ch.name) LIKE ${`%${k}%`})`), sql` AND `)})` : sql`(LOWER(p.name) LIKE ${`%${keywords[0]}%`} OR LOWER(ch.name) LIKE ${`%${keywords[0]}%`})`})
        OR similarity(p.name, ${q}) > ${SIMILARITY_THRESHOLD}
        OR similarity(ch.name, ${q}) > ${SIMILARITY_THRESHOLD}
      )
    ORDER BY ${orderByClause}
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return c.json(rows.rows ?? rows);
});
