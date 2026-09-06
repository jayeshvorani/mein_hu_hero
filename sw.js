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

var CACHE_VERSION = "mhh-v7";

// The cue audio lives in its own cache, on its own version counter.
//
// Not in the main one, because activate() sweeps every cache that is not the
// current version: keeping the mp3s there would throw away 8.8 MB on every
// future edit to the page and make the sound operator download it all again
// over venue wifi. Audio changes when the FILES change, which is a different
// event from shipping a new script.
//
// But versioned all the same, so there is a way to force it. Cache-first with
// no revalidation and query strings stripped means a replaced track under the
// same filename would otherwise play the old recording on every device that
// had already prefetched, forever. BUMP THIS whenever a file in
// "Audio files/" is replaced, added or renamed.
var AUDIO_CACHE = "mhh-audio-v1";

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
            // Keep the current asset cache and the current audio cache. An
            // OLD audio cache is swept like anything else, which is what makes
            // bumping AUDIO_CACHE the way to force replaced tracks through.
            if (k === CACHE_VERSION || k === AUDIO_CACHE) return null;
            return caches.delete(k);
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
  //
  // Keyed and read the same way as every other asset: stored under the path
  // alone, looked up with ignoreSearch, and scoped to this cache. Storing
  // under the full request URL meant a visit carrying a query string (a
  // shared link, a launcher appending its own parameter) wrote an entry that
  // a later plain-URL visit could not find, so the page fell through to the
  // "./index.html" fallback or, offline, to nothing at all.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          // Only cache a real page. fetch() resolves happily for a 404, a 500,
          // or a captive portal's sign-in page, and storing one of those would
          // overwrite the good copy and serve it as the app on the next
          // offline visit. Same guard the asset path below uses.
          if (res && res.status === 200 && res.type === "basic") {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (c) {
              // a quota failure is survivable: the page still works online and
              // the previous cached copy is left intact
              c.put(url.origin + url.pathname, copy).catch(function () {});
            });
          }
          return res;
        })
        .catch(function () {
          return caches.open(CACHE_VERSION).then(function (c) {
            return c.match(req, { ignoreSearch: true }).then(function (hit) {
              return hit || c.match("./index.html");
            });
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
  //
  // Audio is cacheable too, but into AUDIO_CACHE rather than the versioned
  // one, and it is deliberately NOT in PRECACHE: at 8.8 MB the files are
  // several times the weight of everything else the page ships, and only the
  // sound operator ever plays them. They are pulled down by the page itself
  // when "Music cues only" is switched on, which is the operator identifying
  // themselves.
  var isAudio = /\.mp3$/i.test(url.pathname);
  var cacheable =
    isAudio || /\.(woff2|png|svg|webmanifest|css|js)$/i.test(url.pathname);
  var targetCache = isAudio ? AUDIO_CACHE : CACHE_VERSION;

  // ---- range requests ----
  //
  // An <audio> element does not ask for a file, it asks for byte ranges:
  // every browser tested sends "Range: bytes=0-" for the first load, and
  // WebKit (so every browser on the cast's iPhones and iPads) always does.
  //
  // Two things must not happen. A 206 Partial Content must never be written
  // to the cache as though it were a whole file, or the track plays for a few
  // seconds and stops. And a range request must not simply be passed to the
  // network, or the prefetched audio is unreachable the moment the venue wifi
  // drops, which is the entire reason for prefetching it.
  //
  // So: serve ranges out of the cache by slicing the stored whole file and
  // synthesising the 206 ourselves. Only on a miss does it go to the network,
  // and that response is passed through without being stored.
  // Audio only. Any same-origin GET can carry a Range header, and without
  // this test the 2.5 MB hero photo and every font would be pulled into a
  // heap buffer to be sliced, and served with an audio/mpeg fallback
  // Content-Type. Everything else falls through to the ordinary cache-first
  // path below.
  var range = isAudio ? req.headers.get("range") : null;
  if (range) {
    event.respondWith(
      // Scoped to the audio cache, not the global caches.match, which searches
      // every cache in an unspecified order. An earlier build wrote the mp3s
      // into the versioned asset cache, so a device upgrading from it could
      // otherwise be served the stale copy from there and never see a
      // replaced track, which is exactly what versioning AUDIO_CACHE is for.
      caches
        .open(AUDIO_CACHE)
        .then(function (c) {
          return c.match(req, { ignoreSearch: true });
        })
        .then(function (hit) {
          if (!hit) return fetch(req);
          // Blob, not arrayBuffer: Blob.slice is a cheap view over the stored
          // bytes, where arrayBuffer() would read the whole track into the
          // heap and slice() would copy it again, on every seek, on a phone.
          return hit.blob().then(function (body) {
            var total = body.size;
            var m = /bytes=(-?\d*)-(\d*)/.exec(range);
            if (!m) return fetch(req);
            var start, end;
            if (m[1] === "" && m[2] !== "") {
              // suffix form, "bytes=-500" means the LAST 500 bytes. Without
              // this it parsed as start 0, end 500 and returned the wrong end
              // of the file under a header claiming otherwise.
              var len = parseInt(m[2], 10);
              if (isNaN(len) || len <= 0) len = 0;
              start = Math.max(0, total - len);
              end = total - 1;
            } else {
              start = m[1] ? parseInt(m[1], 10) : 0;
              end = m[2] ? parseInt(m[2], 10) : total - 1;
              if (isNaN(end) || end >= total) end = total - 1;
            }
            // Unsatisfiable: past the end, negative, or inverted. An inverted
            // range used to yield a zero-length 206 with a nonsense
            // Content-Range, which a media element cannot recover from.
            if (isNaN(start) || start < 0 || start >= total || end < start) {
              return new Response(null, {
                status: 416,
                headers: {
                  "Content-Range": "bytes */" + total,
                  "Accept-Ranges": "bytes",
                },
              });
            }
            var slice = body.slice(start, end + 1);
            return new Response(slice, {
              status: 206,
              statusText: "Partial Content",
              headers: {
                "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
                "Content-Length": String(slice.size),
                "Content-Range": "bytes " + start + "-" + end + "/" + total,
                "Accept-Ranges": "bytes",
              },
            });
          });
        })
        .catch(function () {
          return fetch(req);
        }),
    );
    return;
  }

  // The lookup must ignore the query string, because the write below stores
  // entries keyed on the path alone. Without ignoreSearch a request carrying
  // "?v=2" would miss the entry it just wrote, re-fetch every visit, and
  // return nothing at all when offline.
  //
  // Scoped to the cache this asset actually belongs in, so audio is read from
  // and written to the same place. The global caches.match searches every
  // cache in an unspecified order, which on a device upgrading from a build
  // that stored mp3s elsewhere could return a copy that AUDIO_CACHE's own
  // version counter has no power over.
  event.respondWith(
    caches
      .open(targetCache)
      .then(function (c) {
        return c.match(req, { ignoreSearch: true });
      })
      .then(function (hit) {
        if (hit) return hit;
        return fetch(req)
          .then(function (res) {
            if (
              cacheable &&
              res &&
              res.status === 200 &&
              res.type === "basic"
            ) {
              var copy = res.clone();
              caches.open(targetCache).then(function (c) {
                // store without the query string so repeated cache-busted
                // requests for one file cannot pile up as separate entries.
                // A quota failure is survivable, and likely here: the audio
                // cache alone is 8.8 MB on the operator's phone.
                c.put(url.origin + url.pathname, copy).catch(function () {});
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
