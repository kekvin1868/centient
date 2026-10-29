// One dev server for the Worker (in workerd, via Cloudflare's plugin) and the React client, with HMR.
// Tailwind builds Konsta UI's classes plus our own. The signals transform makes components that read a
// signal's .value re-render when it changes (client code only; the Worker has no components).
// Local D1 state is the same .wrangler/state that `wrangler d1 migrations apply --local` writes;
// CENTIENT_STATE points it elsewhere (browser tests use a throwaway folder).
import { cloudflare } from '@cloudflare/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    babel({ include: /[\\/]client[\\/]src[\\/].*\.tsx?$/, plugins: [['module:@preact/signals-react-transform']] }),
    tailwindcss(),
     cloudflare({ persistState: process.env.CENTIENT_STATE ? { path: process.env.CENTIENT_STATE } : true }),
  ],
  publicDir: 'client/public',
  // 8787 keeps the README, the spec and the ngrok steps valid; host: true serves the LAN for phone testing.
  // ngrok domains reach the dev server; signing in still needs the host in DEV_HOSTS (middleware/auth.ts).
  server: { port: Number(process.env.PORT ?? 8787), host: true, strictPort: true, allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'] },
});
