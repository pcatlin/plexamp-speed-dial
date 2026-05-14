/**
 * Minimal service worker for PWA installability only.
 * Does not intercept fetch — the browser uses the normal network stack, which avoids
 * uncaught "Failed to fetch" when a passthrough fetch() rejects (navigations, extensions, etc.).
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
