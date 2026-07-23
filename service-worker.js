/* =========================================================
   FoodERP Lite — Service Worker
   Caches the app shell so the whole app opens with no
   internet connection at all (offline-first requirement).
   Bump CACHE_NAME whenever shell files change so old
   caches get cleaned up.
   ========================================================= */

const CACHE_NAME = "fooderp-shell-v13";

const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/auth.js",
  "./js/branding.js",
  "./js/printing.js",
  "./js/barcode.js",
  "./js/scanner.js",
  "./js/vendor/jsbarcode.min.js",
  "./js/vendor/qrcode.min.js",
  "./js/vendor/chart.min.js",
  "./js/reports-helpers.js",
  "./js/sync.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./pages/operator-home.html",
  "./pages/dashboard.html",
  "./pages/billing.html",
  "./pages/label-printing.html",
  "./pages/stock-entry.html",
  "./pages/customer-search.html",
  "./pages/products.html",
  "./pages/categories.html",
  "./pages/customers.html",
  "./pages/suppliers.html",
  "./pages/purchase.html",
  "./pages/production.html",
  "./pages/inventory.html",
  "./pages/sales.html",
  "./pages/reports.html",
  "./pages/sync.html",
  "./sync/AppsScript.gs",
  "./sync/schema.sql",
  "./pages/settings.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* Cache-first for the app shell, falling back to network,
   then falling back to the cached index.html for navigations
   (so deep-ish links still work offline). */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
