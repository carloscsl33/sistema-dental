// Service worker: solo guarda el "cascarón" de la app. Nunca guarda respuestas de Supabase ni datos de pacientes.
const CACHE = 'dental-shell-v6';
const SHELL = ["./", "index.html", "css/styles.css", "manifest.webmanifest", "icons/icon-192.png", "js/auth.js", "js/config.js", "js/supabase.js", "js/supabase-client.js", "js/appointments.js", "js/calendar.js", "js/data.js", "js/events.js", "js/main.js", "js/patients.js", "js/payments.js", "js/state.js", "js/utils.js"];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    try {
      const response = await fetch(e.request);
      if (response.ok) cache.put(e.request, response.clone());
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }));
});
