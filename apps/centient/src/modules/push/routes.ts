// /api/push: bill reminders for this browser.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { json } from '../../lib/schemas';

export const pushRoutes = new Hono<AppEnv>()
  .get('/', c => c.json(c.var.services.push.info()))

  // What PushManager.subscribe() gave this browser (its toJSON()).
  .post(
    '/subscribe',
    json(
      z.object({
        endpoint: z.string().url().max(1000),
        keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
      }),
    ),
    async c => {
      const { endpoint, keys } = c.req.valid('json');
      await c.var.services.push.subscribe({ endpoint, ...keys });
      return c.json({ ok: true });
    },
  )

  .post('/unsubscribe', json(z.object({ endpoint: z.string().max(1000) })), async c => {
    await c.var.services.push.unsubscribe(c.req.valid('json').endpoint);
    return c.json({ ok: true });
  })

  .post('/test', async c => c.json(await c.var.services.push.test()));
