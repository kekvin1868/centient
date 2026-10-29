// Zod schemas shared by more than one module, and the validator helpers every route uses.
import { DECIMALS } from '@centient/money';
import { validator } from 'hono/validator';
import { z } from 'zod';

export const id = z.string().min(1).max(64);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const money = z.number().int().positive();
export const text = (max: number) => z.string().trim().max(max);
export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb color');

export const accountKinds = ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH', 'CREDIT_CARD', 'PAYLATER', 'EXCHANGE', 'IOU'] as const;
export const currency = z.enum(Object.keys(DECIMALS) as [string, ...string[]]);

/** One thing to log. Quick add, installments and the entry form all send these. */
export const command = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('EXPENSE'), accountId: id, envelopeId: id.optional(), categoryId: id, amount: money, date: day,
    merchant: text(120).optional(), note: text(500).optional(),
    split: z.object({ people: z.number().int().min(2).max(50), iouAccountId: id.optional() }).optional(),
    originalAmount: money.optional(), originalCurrency: currency.optional(),
  }),
  z.object({
    type: z.literal('INCOME'), accountId: id, envelopeId: id.optional(), categoryId: id, amount: money, date: day,
    merchant: text(120).optional(), note: text(500).optional(),
  }),
  z.object({
    type: z.literal('TRANSFER'), fromAccountId: id, toAccountId: id, amount: money, toAmount: money.optional(),
    fromEnvelopeId: id.optional(), toEnvelopeId: id.optional(), fee: money.optional(), date: day, note: text(500).optional(),
  }),
  z.object({ type: z.literal('ALLOCATE'), fromEnvelopeId: id, toEnvelopeId: id, amount: money, date: day, note: text(500).optional() }),
]);
export type Command = z.infer<typeof command>;

/** PATCH body for an account, pocket or category; each repo ignores the columns it does not have. */
export const patch = z.object({
  name: text(60).min(1).optional(), kind: z.enum(accountKinds).optional(), provider: text(30).nullable().optional(), currency_code: currency.optional(),
  default_envelope_id: id.nullable().optional(), due_day: z.number().int().min(1).max(31).nullable().optional(),
  target_amount: money.nullable().optional(), target_date: day.nullable().optional(), archived: z.boolean().optional(),
  color: hex.nullable().optional(),
});
export type Patch = z.infer<typeof patch>;

// Zod errors thrown here reach onError as VALIDATION; a body that is not JSON parses as {}.
export const json = <T extends z.ZodType>(schema: T) => validator('json', (v): z.infer<T> => schema.parse(v));
export const query = <T extends z.ZodType>(schema: T) => validator('query', (v): z.infer<T> => schema.parse(v));
