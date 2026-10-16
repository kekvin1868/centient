# Balance Tracker

Private balance tracker on Cloudflare Workers + D1.

## Run locally

```sh
npm install
npm run dev        # applies migrations to the local D1, then serves http://localhost:8787
npm test           # parser, ledger and D1 integration tests
npm run typecheck
```

Copy `apps/tracker/.dev.vars.example` to `apps/tracker/.dev.vars`; locally you are signed in as its `DEV_EMAIL`. That bypass only works on
localhost; in production every request needs a valid Cloudflare Access JWT.

## Layout

- `packages/money` - amount parsing (25rb, 1,5jt, Rp52.500) and formatting
- `packages/quickadd` - quick-add parser: abbreviations, Hokkien words, price-range context engine
- `apps/tracker/src/domain` - ledger rules and budget cycles (no I/O)
- `apps/tracker/src/application` - use cases and ports
- `apps/tracker/src/infrastructure` - D1 repositories
- `apps/tracker/src/interface` - Hono routes, Zod validation, Access auth
- `apps/tracker/web` - bare-minimum UI, plain HTML/JS
- `apps/tracker/migrations` - D1 schema

## Deployment

1. `npx wrangler d1 create balance-tracker` and put the id in `apps/tracker/wrangler.toml`.
2. Protect the hostname with Cloudflare Access; set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SERVICE_TOKEN_EMAIL`.
3. `npm run deploy -w apps/tracker`.
