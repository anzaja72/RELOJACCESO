// Service worker del kiosco: deja /kiosk abrir sin internet.
// Solo cachea la página, sus assets estáticos y los modelos faciales; nunca /api.
// ponytail: sin versionado por build; sube CACHE al cambiar la lista de precarga.
const CACHE = "reloj-kiosk-v1";
const PRECACHE = [
  "/kiosk",
  "/manifest.webmanifest",
  "/models/tiny_face_detector_model-weights_manifest.json",
  "/models/tiny_face_detector_model.bin",
  "/models/face_landmark_68_model-weights_manifest.json",
  "/models/face_landmark_68_model.bin",
  "/models/face_recognition_model-weights_manifest.json",
  "/models/face_recognition_model.bin",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página avisa qué assets de /_next/static usa para cachearlos en la primera visita.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(
    (u) => typeof u === "string" && u.startsWith("/_next/static/"),
  );
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && url.pathname === "/kiosk") {
    // Con red, la página fresca; sin red, la última guardada.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put("/kiosk", copy));
          }
          return res;
        })
        .catch(() => caches.match("/kiosk").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/models/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
