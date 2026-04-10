// Becoming Protocol Service Worker
const CACHE_NAME = 'becoming-protocol-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/butterfly.svg',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Supabase API, fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API calls and auth endpoints
  if (url.pathname.startsWith('/api') || url.pathname.includes('/auth/')) return;

  event.respondWith(
    // Try network first
    fetch(request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache on network failure
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return the cached index.html (SPA fallback)
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle push notifications (for future handler-initiated sessions)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'You have a task waiting.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'handler-notification',
    requireInteraction: data.urgent || false,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BP', options)
  );
});

// Handle messages from the app (for showing notifications when tab is hidden)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag, url, requireInteraction } = event.data;
    self.registration.showNotification(title || 'Handler', {
      body: body || 'You have a message waiting.',
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tag || 'handler-message',
      requireInteraction: requireInteraction || false,
      data: { url: url || '/' }
    });
  }
});

// Handle notification clicks — focus an existing window if available,
// otherwise open a new one. Sends a postMessage so the app can route to
// the Handler chat if it's already loaded.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const tag = event.notification.tag || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Tell the app to route to the Handler chat
          try {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              tag,
              url,
            });
          } catch (e) {
            // postMessage not supported — proceed with focus + navigate
          }
          return client.focus().then((focused) => {
            // Navigate the focused client if it's not already on the target URL
            if (focused && 'navigate' in focused && !focused.url.endsWith(url)) {
              return focused.navigate(url).catch(() => focused);
            }
            return focused;
          });
        }
      }
      // Open new window if no existing window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
