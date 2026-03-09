/* ═══════════════════════════════════════════════════════════════════════════════
   NearMart Service Worker
   ─ Precaching · Runtime Caching · Offline Fallback · Push Readiness
   ═══════════════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = "nearmart-v2";
const OFFLINE_URL = "/offline.html";

// ── App-Shell assets to precache on install ─────────────────────────────────
const PRECACHE_ASSETS = [
    "/",
    "/index.html",
    "/offline.html",
    "/manifest.json",
    "/favicon.ico",
    "/logo192.png",
    "/logo512.png",
];

// ── Install: cache app shell + offline page ─────────────────────────────────
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn("[SW] Precache failed for some assets (non-critical):", err.message);
            })
        )
    );
    self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────────────────────────
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
    self.clients.claim(); // Take control of all pages immediately
});

// ── Fetch: strategy router ──────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests (POST, PUT, DELETE go straight to network)
    if (request.method !== "GET") return;

    // Skip chrome-extension, devtools, etc.
    if (!url.protocol.startsWith("http")) return;

    // ── CRITICAL: Payment/Order/Wallet APIs must NEVER be cached ────────
    // These endpoints contain live financial state. Serving stale cached
    // responses could show incorrect payment status or wallet balances.
    const NEVER_CACHE_PATHS = ["/api/payments", "/api/orders", "/api/wallet"];
    if (NEVER_CACHE_PATHS.some(p => url.pathname.startsWith(p))) {
        event.respondWith(fetch(request));
        return;
    }

    // ── Other API requests: Network-First with timeout fallback ────────
    if (url.pathname.startsWith("/api")) {
        event.respondWith(networkFirstWithTimeout(request, 8000));
        return;
    }

    // ── Static assets (JS, CSS, images, fonts): Cache-First ───────────────
    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // ── Navigation requests: Network-First, offline fallback ──────────────
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // ── Everything else: Network-First ────────────────────────────────────
    event.respondWith(networkFirst(request));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Caching Strategies
// ═══════════════════════════════════════════════════════════════════════════════

/** Cache-First: serve from cache, fallback to network and cache the response */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response("", { status: 408, statusText: "Offline" });
    }
}

/** Network-First: try network, fallback to cache */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        return cached || new Response("", { status: 408, statusText: "Offline" });
    }
}

/** Network-First with timeout: race network against a timer */
async function networkFirstWithTimeout(request, timeoutMs) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        return cached || new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isStaticAsset(pathname) {
    return /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)$/i.test(pathname);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Push Notification Readiness
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener("push", (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "NearMart";
    const options = {
        body: data.body || "You have a new notification",
        icon: "/logo192.png",
        badge: "/logo192.png",
        vibrate: [100, 50, 100],
        data: { url: data.url || "/" },
        actions: data.actions || [],
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then((clients) => {
            // Focus existing window or open new one
            for (const client of clients) {
                if (client.url === url && "focus" in client) return client.focus();
            }
            return self.clients.openWindow(url);
        })
    );
});
