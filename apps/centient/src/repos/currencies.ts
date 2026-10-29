// Currencies: the table holds only the codes in use (seeded IDR, USD, USDT, BTC). Any other listed code gets its row
// the first time something references it, in the same write, so the foreign keys to currencies(code) hold.
import { CURRENCIES } from '@centient/money';

/** Insert-if-missing for a listed code; callers validate the code first (zod `currency`). */
export function currencyRow(db: D1Database, code: string): D1PreparedStatement {
  const c = CURRENCIES.find(x => x.code === code);
  if (!c) throw new Error(`Unlisted currency ${code}`);
  return db.prepare('INSERT OR IGNORE INTO currencies (code, kind, decimals) VALUES (?, ?, ?)').bind(c.code, c.kind, c.decimals);
}
