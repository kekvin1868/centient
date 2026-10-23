// Every error becomes { code, message } with a status the client can act on.
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppEnv } from '../context';
import { DomainError } from '../domain/ledger';

export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ZodError) return c.json({ code: 'VALIDATION', message: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  if (err instanceof DomainError) return c.json({ code: err.code, message: err.message }, err.code === 'NOT_FOUND' ? 404 : 400);
  if (err instanceof HTTPException && err.status === 400) return c.json({ code: 'VALIDATION', message: err.message }, 400);
  const msg = String(err instanceof Error ? err.message : err);
  if (msg.includes('CATEGORY_LIMIT')) return c.json({ code: 'CATEGORY_LIMIT', message: '200 active categories is the maximum' }, 409);
  if (msg.includes('UNIQUE constraint')) return c.json({ code: 'DUPLICATE', message: 'That name is already used' }, 409);
  console.error(err);
  return c.json({ code: 'INTERNAL', message: 'Something went wrong' }, 500);
};
