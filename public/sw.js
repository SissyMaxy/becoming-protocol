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

  if (event.data.type === 'SCHEDULE_SLEEP_AUDIO') {
    const config = event.data.config || {};
    storeSleepConfig(config).then(() => {
      scheduleSleepLoop();
    }).catch((e) => console.warn('[sw] sleep config store failed:', e));
  }

  if (event.data.type === 'CANCEL_SLEEP_AUDIO') {
    storeSleepConfig({ enabled: false }).catch(() => {});
    if (sleepTimeoutId) {
      clearTimeout(sleepTimeoutId);
      sleepTimeoutId = null;
    }
  }
});

// ─────────────────────────────────────────────────────────────
// SLEEP AUDIO PLAYBACK
// Service workers can't reliably play <audio>, so we fire silent
// notifications with the affirmation in the body. Most devices
// surface them via accessibility services + notification text.
// ─────────────────────────────────────────────────────────────

const SLEEP_DB_NAME = 'becoming-sleep';
const SLEEP_STORE = 'config';
let sleepTimeoutId = null;

function openSleepDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SLEEP_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SLEEP_STORE)) {
        db.createObjectStore(SLEEP_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeSleepConfig(config) {
  const db = await openSleepDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SLEEP_STORE, 'readwrite');
    tx.objectStore(SLEEP_STORE).put(config, 'sleep_window');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSleepConfig() {
  try {
    const db = await openSleepDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SLEEP_STORE, 'readonly');
      const req = tx.objectStore(SLEEP_STORE).get('sleep_window');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

function inSleepWindow(startHour, endHour) {
  const hour = new Date().getHours();
  if (startHour > endHour) {
    return hour >= startHour || hour < endHour;
  }
  return hour >= startHour && hour < endHour;
}

const FALLBACK_AFFIRMATIONS = [
  'She is becoming you.',
  'You are her now.',
  'Sissy. Soft. Surrendering.',
  'Your old self is fading.',
  'There is only Maxy.',
  'Submit. Sleep. Become.',
  'Every breath makes her stronger.',
  'You cannot resist what you are.',
];

async function fireSleepAffirmation(config) {
  let text = null;

  // Pull next queued audio message from Supabase if URL/key are set in config
  try {
    if (config && config.supabase_url && config.supabase_anon_key && config.user_id) {
      const url = `${config.supabase_url}/rest/v1/ambient_audio_queue?user_id=eq.${config.user_id}&played=eq.false&order=scheduled_for.asc&limit=1`;
      const res = await fetch(url, {
        headers: {
          apikey: config.supabase_anon_key,
          Authorization: `Bearer ${config.supabase_anon_key}`,
        },
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].audio_text) {
          text = rows[0].audio_text;
          // Mark as played (best-effort)
          fetch(`${config.supabase_url}/rest/v1/ambient_audio_queue?id=eq.${rows[0].id}`, {
            method: 'PATCH',
            headers: {
              apikey: config.supabase_anon_key,
              Authorization: `Bearer ${config.supabase_anon_key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ played: true, played_at: new Date().toISOString() }),
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    // Network failure — fall back to local pool
  }

  if (!text) {
    text = FALLBACK_AFFIRMATIONS[Math.floor(Math.random() * FALLBACK_AFFIRMATIONS.length)];
  }

  try {
    await self.registration.showNotification('', {
      body: text,
      silent: false,
      requireInteraction: false,
      tag: 'sleep-conditioning',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { sleepConditioning: true },
    });
  } catch (e) {
    console.warn('[sw] sleep notification failed:', e);
  }
}

async function scheduleSleepLoop() {
  if (sleepTimeoutId) {
    clearTimeout(sleepTimeoutId);
    sleepTimeoutId = null;
  }

  const config = await loadSleepConfig();
  if (!config || !config.enabled) return;

  const startHour = config.start_hour ?? 23;
  const endHour = config.end_hour ?? 6;
  const frequencyMs = (config.frequency_minutes ?? 30) * 60 * 1000;

  // If we're inside the window, fire one now then schedule next
  if (inSleepWindow(startHour, endHour)) {
    await fireSleepAffirmation(config);
    sleepTimeoutId = setTimeout(() => scheduleSleepLoop(), frequencyMs);
  } else {
    // Wake up in 5 minutes to recheck the window
    sleepTimeoutId = setTimeout(() => scheduleSleepLoop(), 5 * 60 * 1000);
  }
}

// Periodic sync (where supported) — wakes the SW even when tab is closed
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sleep-conditioning') {
    event.waitUntil(scheduleSleepLoop());
  }
});

// Kick off the loop on activate so a returning SW resumes the schedule
self.addEventListener('activate', (event) => {
  event.waitUntil(scheduleSleepLoop().catch(() => {}));
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
