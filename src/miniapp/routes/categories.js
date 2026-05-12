import { Hono } from "hono";
import { db } from "../../db/index.js";
import { categories, products, channels } from "../../db/schema.js";
import { eq, and, sql, inArray } from "drizzle-orm";

export const categoriesRoutes = new Hono();

const VALID_REGIONS = [
  "Andijon", "Buxoro", "Farg'ona", "Jizzax",
  "Namangan", "Navoiy", "Qashqadaryo", "Samarqand", "Sirdaryo",
  "Surxondaryo", "Toshkent", "Xorazm", "Qoraqalpog'iston Respublikasi"
];

categoriesRoutes.get("/", async (c) => {
  const page = Number(c.req.query("page") ?? 0);
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = page * limit;

  const items = await db
    .select({
      id: categories.id,
      name: categories.name,
      thumbnail: categories.thumbnail,
      metaFields: categories.metaFields,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(categories.createdAt)
    .limit(limit)
    .offset(offset);

  return c.json(items);
});

categoriesRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));

  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      thumbnail: categories.thumbnail,
      metaFields: categories.metaFields,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.isActive, true)))
    .limit(1);

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json(category);
});

categoriesRoutes.get("/:categoryId/meta/:metaKey", async (c) => {
  const categoryId = Number(c.req.param("categoryId"));
  const metaKey = c.req.param("metaKey");

  const category = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.isActive, true)))
    .limit(1);

  if (!category.length) {
    return c.json({ error: "Category not found" }, 404);
  }

  const allProducts = await db
    .select({ meta: products.meta })
    .from(products)
    .innerJoin(channels, eq(products.channelId, channels.id))
    .where(
      and(
        eq(products.categoryId, categoryId),
        eq(products.isSold, false),
        eq(products.wasDeletedFromChannel, false),
        eq(channels.isActive, true)
      )
    );

  const uniqueValues = new Set();
  for (const product of allProducts) {
    const value = product.meta?.[metaKey];
    if (value) uniqueValues.add(value);
  }

  return c.json(Array.from(uniqueValues).sort());
});

categoriesRoutes.get("/:categoryId/products", async (c) => {
  const categoryId = Number(c.req.param("categoryId"));
  const page = Number(c.req.query("page") ?? 0);
  const limit = Number(c.req.query("limit") ?? 15);
  const offset = page * limit;
  const region = c.req.query("region")?.trim();
  const sortBy = c.req.query("sort")?.trim();
  const q = c.req.query("q")?.trim();
  const metaFilters = {};

  for (const [key, value] of Object.entries(c.req.query())) {
    if (key.startsWith("meta_")) {
      const metaKey = key.substring(5);
      metaFilters[metaKey] = value;
    }
  }

  let orderByClause;
  if (sortBy === "cheap") {
    orderByClause = sql`
      CASE
        WHEN p.price IS NULL OR p.price::text = '' THEN 1
        ELSE 0
      END,
      CAST(NULLIF(REGEXP_REPLACE(p.price::text, '[^0-9.]', '', 'g'), '') AS NUMERIC) ASC NULLS LAST,
      p.telegram_date DESC NULLS LAST
    `;
  } else if (sortBy === "expensive") {
    orderByClause = sql`
      CASE
        WHEN p.price IS NULL OR p.price::text = '' THEN 1
        ELSE 0
      END,
      CAST(NULLIF(REGEXP_REPLACE(p.price::text, '[^0-9.]', '', 'g'), '') AS NUMERIC) DESC NULLS LAST,
      p.telegram_date DESC NULLS LAST
    `;
  } else {
    orderByClause = sql`p.telegram_date DESC NULLS LAST`;
  }

  const regionCondition = region && region !== "all" && VALID_REGIONS.includes(region)
    ? sql`AND (ch.region = ${region} OR ch.region IS NULL)`
    : sql``;

  const searchCondition = q && q.length >= 2
    ? sql`AND (LOWER(p.name) LIKE ${`%${q.toLowerCase()}%`} OR LOWER(ch.name) LIKE ${`%${q.toLowerCase()}%`})`
    : sql``;

  const metaConditions = Object.entries(metaFilters).map(([key, value]) =>
    sql`p.meta->>${key} = ${value}`
  );

  const metaConditionsSql = metaConditions.length > 0
    ? sql`AND ${sql.join(metaConditions, sql` AND `)}`
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
      p.meta,
      ch.name AS "channelName",
      ch.link AS "channelLink",
      ch.telegram_id AS "channelTelegramId",
      ch.profile_image AS "channelProfileImage",
      ch.region AS "channelRegion"
    FROM products p
    INNER JOIN channels ch ON p.channel_id = ch.id
    WHERE
      p.category_id = ${categoryId}
      AND p.is_sold = false
      AND p.was_deleted_from_channel = false
      AND ch.is_active = true
      ${regionCondition}
      ${searchCondition}
      ${metaConditionsSql}
    ORDER BY ${orderByClause}
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return c.json(rows.rows ?? rows);
});
