// Workspace use cases: who am I, settings, the catalog, crypto prices, backup / CSV export, reset.
import { DECIMALS } from '@centient/money';
import type { ServiceDeps } from '../../context';
import { cycleStart, jakartaToday, nextCycleStart } from '../../domain/cycle';
import type { Price } from '../../repos/prices';
import type { LedgerService } from '../ledger/service';

// CoinGecko ids for the crypto currencies we can price. Fiat (USD) is not priced: no free, keyless source we trust.
const COINGECKO: Record<string, string> = { BTC: 'bitcoin', USDT: 'tether' };
const PRICE_TTL_MS = 10 * 60_000;

export function createWorkspaceService({ ws, now, repos, catalog, ledger, fetch }: ServiceDeps & { ledger: LedgerService; fetch: typeof globalThis.fetch }) {
  const stamp = () => new Date(now()).toISOString();

  return {
    async me() {
      const w = await repos.workspaces.get(ws);
      const today = jakartaToday(now());
      const from = cycleStart(today, w.cycle_start_day);
      return { workspace: w, today, cycle: { from, to: nextCycleStart(from, w.cycle_start_day) }, currencies: DECIMALS };
    },

    async update(i: { name?: string; cycle_start_day?: number; onboarded?: true }) {
      const { onboarded, ...rest } = i;
      await repos.workspaces.update(ws, { ...rest, onboarded_at: onboarded ? stamp() : undefined });
    },

    /** Every account, pocket and category, archived ones included. */
    async catalog() {
      const { accounts, envelopes, categories } = await catalog.load();
      return { accounts, envelopes, categories };
    },

    /**
     * Rupiah prices for the crypto currencies this workspace's accounts hold. Served from the last saved price
     * when it is under 10 minutes old; otherwise refreshed from CoinGecko. If that fails (offline, rate limit),
     * the last saved price is returned with its time, so the client can show "as of" instead of nothing.
     * ponytail: CoinGecko's free tier allows ~30 calls/minute; one shared row per coin keeps us far under it.
     * Add an API key (or a second source) only if prices go missing.
     */
    async prices(): Promise<Record<string, { idrPerUnit: number; fetchedAt: string }>> {
      const held = [...new Set((await repos.accounts.list(ws)).filter(a => !a.archived_at).map(a => a.currency_code))].filter(c => COINGECKO[c]);
      const at = now();
      let rows = await repos.prices.get(held);
      const stale = held.filter(c => { const r = rows.find(x => x.currency_code === c); return !r || at - Date.parse(r.fetched_at) > PRICE_TTL_MS; });
      if (stale.length) {
        try {
          const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=idr&ids=${stale.map(c => COINGECKO[c]).join(',')}`;
          const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Centient/1.0 (personal finance app)' }, signal: AbortSignal.timeout(4000) });
          if (!res.ok) throw new Error(`price service ${res.status}`);
          const body = await res.json() as Record<string, { idr?: number }>;
          const fetchedAt = new Date(at).toISOString();
          const fresh: Price[] = stale.flatMap(c => { const idr = body[COINGECKO[c]]?.idr; return idr && idr > 0 ? [{ currency_code: c, idr_per_unit: Math.round(idr), fetched_at: fetchedAt }] : []; });
          await repos.prices.save(fresh);
          rows = [...rows.filter(r => !fresh.some(f => f.currency_code === r.currency_code)), ...fresh];
        } catch (e) {
          console.warn('price refresh failed; serving last known prices', e);
        }
      }
      return Object.fromEntries(rows.map(r => [r.currency_code, { idrPerUnit: r.idr_per_unit, fetchedAt: r.fetched_at }]));
    },

    /** Everything in the workspace as one JSON document: what a backup download contains. */
    async backup() {
      const [workspace, { accounts, envelopes, categories }, budgets, aliases] = await Promise.all([
        repos.workspaces.get(ws), catalog.load(), repos.budgets.list(ws), repos.aliases.list(ws),
      ]);
      const entries = [];
      let cursor: string | undefined;
      do {
        const page = await ledger.listEntries({ limit: 200, cursor });
        entries.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return { format: 'centient-backup', version: 1, exported_at: stamp(), workspace, accounts, envelopes, categories, budgets, aliases, entries };
    },

    async csv(): Promise<string> {
      const c = await catalog.load();
      const name = (rows: { id: string; name: string }[], id: string | null) => rows.find(r => r.id === id)?.name ?? '';
      const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const lines = ['date,type,account,amount,currency,envelope,category,merchant,note'];
      let cursor: string | undefined;
      do {
        const page = await repos.entries.list(ws, { limit: 500, cursor });
        for (const t of page.items) {
          const envelopes = t.allocations.map(a => name(c.envelopes, a.envelope_id)).join(' > ');
          // One row per account line; an ALLOCATE has none, so it gets one row per envelope line.
          const rows = t.entries.length
            ? t.entries.map(e => { const acc = c.accounts.find(a => a.id === e.account_id); return [acc?.name ?? '', e.amount, acc?.currency_code ?? '', envelopes]; })
            : t.allocations.map(a => { const env = c.envelopes.find(x => x.id === a.envelope_id); return ['', a.amount, env?.currency_code ?? '', env?.name ?? '']; });
          for (const [account, amount, currency, envelope] of rows) {
            lines.push([t.occurred_at, t.type, String(account), String(amount), String(currency), String(envelope), name(c.categories, t.category_id), t.merchant ?? '', t.note ?? ''].map(cell).join(','));
          }
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return lines.join('\n');
    },

    /** Soft-deletes the workspace; the next request creates a fresh, seeded one. */
    async reset() {
      await repos.workspaces.reset(ws, stamp());
    },
  };
}
