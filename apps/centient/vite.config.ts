// One dev server for the Worker (in workerd, via Cloudflare's plugin) and the Preact client, with HMR.
// Local D1 state is the same .wrangler/state that `wrangler d1 migrations apply --local` writes;
// CENTIENT_STATE points it elsewhere (browser tests use a throwaway folder).
import { cloudflare } from '@cloudflare/vite-plugin';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact(), cloudflare({ persistState: process.env.CENTIENT_STATE ? { path: process.env.CENTIENT_STATE } : true })],
  publicDir: 'client/public',
  // 8787 keeps the README, the spec and the ngrok steps valid; host: true serves the LAN for phone testing.
  server: { port: Number(process.env.PORT ?? 8787), host: true, strictPort: true },
});
