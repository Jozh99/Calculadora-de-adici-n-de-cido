"use strict";

const scope = new URL(self.registration.scope);
const cacheVersion = "v1";
const cachePrefix = `crema-acidez:${scope.href}:`;
const cacheName = `${cachePrefix}${cacheVersion}`;
const index = new URL("index.html", scope);
const appFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "install.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png"
].map((file) => new URL(file, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => {
    const requests = [...appFiles].map((url) => new Request(url, { cache: "reload" }));
    return cache.addAll(requests);
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const outdated = keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(outdated.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isAppEntry = request.mode === "navigate" && url.origin === scope.origin &&
    (url.pathname === scope.pathname || url.pathname === index.pathname);
  const cacheKey = isAppEntry ? index.href : url.href;
  if (!appFiles.has(cacheKey)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(cacheKey)) ?? fetch(request);
  })());
});
