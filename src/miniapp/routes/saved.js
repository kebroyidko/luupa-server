import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { savedProducts } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const savedRoutes = new Hono();

savedRoutes.post('/', async (c) => {
  const { userId, productId, channelId } = await c.req.json();
  if (!userId || !productId || !channelId) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const existing = await db.select().from(savedProducts).where(
    and(
      eq(savedProducts.userId, userId),
      eq(savedProducts.productId, productId)
    )
  ).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Already saved' }, 400);
  }
  const [saved] = await db.insert(savedProducts).values({
    userId,
    productId,
    channelId,
    savedAt: new Date()
  }).returning();
  return c.json(saved);
});

savedRoutes.get('/:userId', async (c) => {
  const userId = c.req.param('userId');
  const items = await db.select().from(savedProducts).where(
    eq(savedProducts.userId, userId)
  ).orderBy(desc(savedProducts.savedAt));
  return c.json(items);
});

savedRoutes.delete('/:userId/:productId', async (c) => {
  const userId = c.req.param('userId');
  const productId = c.req.param('productId');
  await db.delete(savedProducts).where(
    and(
      eq(savedProducts.userId, userId),
      eq(savedProducts.productId, productId)
    )
  );
  return c.json({ success: true });
});

export default savedRoutes;
