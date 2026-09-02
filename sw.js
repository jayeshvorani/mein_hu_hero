/* Mein hu Hero, service worker.
 *
 * The cast open this at rehearsal, where venue wifi is unreliable or absent.
 * Strategy:
 *   - Navigations: network first, falling back to the cached page. This means
 *     an updated script reaches everyone on their next online visit without a
 *     hard refresh, while a dead connection still opens the page instantly.
 *   - Everything else (fonts, icons, manifest): cache first. These are
 *     content-addressed by filename and only change when CACHE_VERSION does.
 *
 * Bump CACHE_VERSION whenever the shipped assets change. Old caches are
 * deleted on activate, so a stale font subset can never linger.
 */

var CACHE_VERSION = "mhh-v3";
var PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./fonts/BricolageGrotesque-subset.woff2",
  "./fonts/HankenGrotesk-subset.woff2",
  "./fonts/HankenGrotesk-Italic-subset.woff2",
  "./fonts/JetBrainsMono-subset.woff2",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        // addAll fails the whole install if any single request fails, which
        // would leave the cast with no offline copy at all. Add individually
        // and tolerate a miss.
        return Promise.all(
          PRECACHE.map(function (url) {
            return cache.add(url).catch(function () {
              return null;
            });
          }),
        );
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            return k === CACHE_VERSION ? null : caches.delete(k);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // never touch anything outside our own origin
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so an update lands, cache as the safety net.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) {
            c.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("./index.html");
          });
        }),
    );
    return;
  }

  // Everything else: cache first, then network.
  //
  // Only the asset types this page actually ships are added to the cache on
  // the way past. Without that test any same-origin GET would be stored
  // forever, including one-off requests with cache-busting query strings, and
  // the cache would grow without bound on a phone.
  var cacheable = /\.(woff2|png|svg|webmanifest|css|js)$/i.test(url.pathname);

  // The lookup must ignore the query string, because the write below stores
  // entries keyed on the path alone. Without ignoreSearch a request carrying
  // "?v=2" would miss the entry it just wrote, re-fetch every visit, and
  // return nothing at all when offline.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req)
        .then(function (res) {
          if (cacheable && res && res.status === 200 && res.type === "basic") {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (c) {
              // store without the query string so repeated cache-busted
              // requests for one file cannot pile up as separate entries
              c.put(url.origin + url.pathname, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return hit;
        });
    }),
  );
});
