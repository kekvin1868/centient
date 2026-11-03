// /api/insights
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { currency, day, query } from '../../lib/schemas';

export const reportsRoutes = new Hono<AppEnv>().get(
  '/insights',
  query(
    z.object({
      period: z.enum(['cycle', 'year']).optional(),
      date: day.optional(),
      currency: currency.optional(),
    }),
  ),
  async c => c.json(await c.var.services.reports.insights(c.req.valid('query'))),
);
