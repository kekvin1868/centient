// Registers the service worker (client/public/sw.js) so the app opens with no signal. Production builds only:
// in development it would serve stale code over hot reload.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  // A worker that just took over saw none of this page's downloads, so the page lists them for it.
  sw.addEventListener('controllerchange', () => {
    const files = performance
      .getEntriesByType('resource')
      .map(entry => new URL(entry.name))
      .filter(url => url.origin === location.origin && url.pathname.startsWith('/assets/'))
      .map(url => url.pathname);
    sw.controller?.postMessage([...new Set(files)]);
  });
  // Offline support is an extra: a refused registration (private mode) must not break the app.
  addEventListener('load', () => void sw.register(`/sw.js?v=${__BUILD_ID__}`).catch(() => {}));
}
