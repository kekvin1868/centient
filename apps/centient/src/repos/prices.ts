// Last known rupiah price of one whole coin per currency (global, not per workspace).

export type Price = { currency_code: string; idr_per_unit: number; fetched_at: string };

export function pricesRepo(db: D1Database) {
  return {
    async get(codes: string[]) {
      if (!codes.length) return [];
      return (await db.prepare('SELECT currency_code, idr_per_unit, fetched_at FROM prices WHERE currency_code IN (SELECT value FROM json_each(?))')
        .bind(JSON.stringify(codes)).all<Price>()).results;
    },

    async save(prices: Price[]) {
      if (!prices.length) return;
      await db.batch(prices.map(p => db.prepare(`INSERT INTO prices (currency_code, idr_per_unit, fetched_at) VALUES (?, ?, ?)
        ON CONFLICT (currency_code) DO UPDATE SET idr_per_unit = excluded.idr_per_unit, fetched_at = excluded.fetched_at`).bind(p.currency_code, p.idr_per_unit, p.fetched_at)));
    },
  };
}
