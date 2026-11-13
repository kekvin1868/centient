// One dev server for the Worker (in workerd, via Cloudflare's plugin) and the React client, with HMR.
// Tailwind builds Konsta UI's classes plus our own. The signals transform makes components that read a
// signal's .value re-render when it changes (client code only; the Worker has no components).
// Local D1 state is the same .wrangler/state that `wrangler d1 migrations apply --local` writes;
// CENTIENT_STATE points it elsewhere (browser tests use a throwaway folder).
import { cloudflare } from '@cloudflare/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The text reader's files (lib/ocr.ts), served at /ocr from node_modules: its worker, the engine (the browser
// picks one of three by what the phone's processor can do) and the Indonesian + English language data. Nothing
// is copied into the repo; a build writes them to dist/client/ocr.
const modules = resolve(import.meta.dirname, '../../node_modules');
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js':
    'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'ind.traineddata.gz': '@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz',
};
const ocrAssets = (): Plugin => ({
  name: 'centient:ocr-assets',
  configureServer(server) {
    server.middlewares.use('/ocr', (req, res, next) => {
      const name = (req.url ?? '').slice(1).split('?')[0];
      if (!(name in OCR_FILES)) return next();
      // The language files are gzip *data* the reader unpacks itself: never Content-Encoding.
      res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'application/gzip');
      createReadStream(resolve(modules, OCR_FILES[name])).pipe(res);
    });
  },
  generateBundle() {
    if (this.environment.name !== 'client') return;
    for (const [name, file] of Object.entries(OCR_FILES))
      this.emitFile({
        type: 'asset',
        fileName: `ocr/${name}`,
        source: readFileSync(resolve(modules, file)),
      });
  },
});

export default defineConfig({
  plugins: [
    react(),
    babel({
      include: /[\\/]client[\\/]src[\\/].*\.tsx?$/,
      plugins: [['module:@preact/signals-react-transform']],
    }),
    tailwindcss(),
    ocrAssets(),
    cloudflare({
      persistState: process.env.CENTIENT_STATE ? { path: process.env.CENTIENT_STATE } : true,
    }),
  ],
  publicDir: 'client/public',
  // A new id per build: the device's saved query cache is dropped when the app changes (models/query.ts).
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  // 8787 keeps the README, the spec and the ngrok steps valid; host: true serves the LAN for phone testing.
  // ngrok domains reach the dev server; signing in still needs the host in DEV_HOSTS (middleware/auth.ts).
  server: {
    port: Number(process.env.PORT ?? 8787),
    host: true,
    strictPort: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'],
  },
});
