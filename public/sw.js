// Becoming Protocol Service Worker
// v2 (2026-07-04): the v1 SW cached the app SHELL ('/' + '/index.html') and
// served it back, so shipped code never reached the user — the "I don't see
// changes" bug, reproduced live. Fix: NEVER cache or serve the HTML shell from
// cache when online (navigations are network-only, cache is offline-only
// fallback), so the shell is always fresh and always points at the current
// hashed bundles. Bumping the cache name purges every stale v1 asset on activate.
const CACHE_NAME = 'becoming-protocol-v3';
const STATIC_ASSETS = [
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

  // NAVIGATIONS / HTML: network-only with no-store, so the app shell is ALWAYS
  // the freshest deploy (never a cached stale shell pointing at old bundles).
  // Only fall back to a cached shell when genuinely offline.
  const isHTML = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          // Keep ONE offline fallback copy, but never serve it while online.
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/offline-shell', clone));
          }
          return response;
        })
        .catch(() => caches.match('/offline-shell').then((r) => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  event.respondWith(
    // Hashed assets (JS/CSS/img) are immutable — network-first, cache on success.
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle push notifications (for future handler-initiated sessions).
// When the server-side dispatcher has neutralized the payload (stealth
// mode), it sets data.stealth=true and replaces the title/body. We
// also drop any banner art and use a plain grey badge so the lock-
// screen preview reveals nothing about the source.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const isStealth = Boolean(data?.data?.stealth);
  // outreach_id + action_kind survive stealth neutralization (allowlisted in
  // _shared/stealth.ts). They let the SW build the right action buttons and
  // route the tap to /api/outreach without revealing content.
  const outreachId = data?.data?.outreach_id || null;
  const actionKind = data?.data?.action_kind || null;

  // ACTIONS array. iOS PWAs render NONE of these (taps just open the app — the
  // notificationclick deep-link fallback handles that path), but Android /
  // desktop Chrome show them. Under stealth we expose ONLY a neutral "Open" so
  // a lock screen never reveals that there's a confession/photo to answer.
  const actions = buildNotificationActions(actionKind, isStealth);

  // Deep-link the click target so even a plain "open the app" tap auto-completes
  // via the in-app router (?complete_outreach=<id>). Reply text, when the user
  // uses the inline action, is appended in notificationclick.
  const url = outreachId
    ? '/?complete_outreach=' + encodeURIComponent(outreachId)
    : (isStealth ? '/' : (data.url || '/'));

  const options = isStealth
    ? {
        body: data.body || 'Tap to view',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'message',
        renotify: false,
        requireInteraction: false,
        silent: false,
        actions,
        data: { url, outreach_id: outreachId, action_kind: actionKind, stealth: true },
      }
    : {
        body: data.body || 'You have a task waiting.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'handler-notification',
        requireInteraction: data.urgent || false,
        actions,
        data: { url, outreach_id: outreachId, action_kind: actionKind },
      };

  event.waitUntil(
    self.registration.showNotification(isStealth ? (data.title || 'New message') : (data.title || 'BP'), options)
  );
});

// Build the notification action set from the coarse action_kind.
//   confession / reply → inline-text "Reply" + "Open"
//   photo              → "Snap it" (just opens the camera surface)
//   plain              → "Mark done" + "Open"
// Under stealth, NEVER reveal a content-bearing label on a lock screen — show
// only a neutral "Open". (Note: only the first ~2 actions render on most
// platforms, and many show none; this is best-effort enhancement.)
function buildNotificationActions(actionKind, isStealth) {
  if (isStealth) {
    return [{ action: 'open', title: 'Open' }];
  }
  switch (actionKind) {
    case 'confession':
    case 'reply':
      return [
        { action: 'reply', title: 'Reply', type: 'text', placeholder: 'Answer Mama' },
        { action: 'open', title: 'Open' },
      ];
    case 'photo':
      return [{ action: 'open', title: 'Snap it' }];
    case 'plain':
      return [
        { action: 'done', title: 'Mark done' },
        { action: 'open', title: 'Open' },
      ];
    default:
      return [];
  }
}

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

// ─────────────────────────────────────────────────────────────
// NOTIFICATION ACTION AUTH BRIDGE
// notificationclick runs with no window, so it can't read the Supabase
// session (localStorage). The app caches a short-lived access_token in
// IndexedDB ('becoming-sw-auth' → store 'bp-auth' → key 'session'); the SW
// reads it here to authenticate POSTs to /api/outreach. On any miss/expiry we
// fall back to the deep-link (?complete_outreach=...), which the in-app router
// completes via the live session. Never write the refresh_token here.
// ─────────────────────────────────────────────────────────────

const SW_AUTH_DB = 'becoming-sw-auth';
const SW_AUTH_STORE = 'bp-auth';
const SW_AUTH_KEY = 'session';

function readSwAccessToken() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(SW_AUTH_DB, 1);
    } catch {
      resolve(null);
      return;
    }
    // If the store doesn't exist yet (app never cached), don't create a half
    // DB — just bail to the fallback.
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(SW_AUTH_STORE)) {
          db.createObjectStore(SW_AUTH_STORE);
        }
      } catch { /* ignore */ }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SW_AUTH_STORE)) { resolve(null); return; }
      try {
        const tx = db.transaction(SW_AUTH_STORE, 'readonly');
        const getReq = tx.objectStore(SW_AUTH_STORE).get(SW_AUTH_KEY);
        getReq.onsuccess = () => {
          const row = getReq.result;
          if (!row || !row.access_token) { resolve(null); return; }
          // Treat as expired with a 60s safety margin — a stale token just
          // routes us to the deep-link fallback.
          if (row.expires_at && row.expires_at <= Date.now() + 60_000) { resolve(null); return; }
          resolve(row.access_token);
        };
        getReq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

// POST the completion/reply to /api/outreach using the cached token. Returns
// true on a 2xx, false on missing-token or any non-2xx (caller falls back to
// the deep-link). reply_text present → /reply; absent → /complete.
//
// PARITY: this endpoint-selection + the empty-confession/photo guard in
// notificationclick must match planOutreachCompletion() in
// src/lib/push/outreach-action.ts (the in-app router's source of truth). This
// is a classic service worker and can't import that module; the contract is
// pinned by the source-parity test in src/__tests__/lib/outreach-action.test.ts.
async function completeFromSW(outreachId, opts) {
  const replyText = opts && typeof opts.reply_text === 'string' ? opts.reply_text.trim() : '';
  const token = await readSwAccessToken();
  if (!token) return false;
  const action = replyText ? 'reply' : 'complete';
  const bodyObj = replyText
    ? { outreach_id: outreachId, reply_text: replyText }
    : { outreach_id: outreachId };
  try {
    const res = await fetch('/api/outreach/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(bodyObj),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Focus an existing window or open a new one at the given URL. Used as the
// deep-link fallback (and the plain "open" path). When `actionMsg` is given and
// a window is already open, we postMessage the in-app router instead of forcing
// a navigation — a focused SPA won't re-run its on-load param read, so the
// message ('OUTREACH_ACTION') is how the already-open app learns to complete.
function focusOrOpen(url, actionMsg) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        if (actionMsg) {
          try { client.postMessage(actionMsg); } catch (e) { /* ignore */ }
        }
        return client.focus().then((focused) => {
          if (focused && 'navigate' in focused && !focused.url.endsWith(url)) {
            return focused.navigate(url).catch(() => focused);
          }
          return focused;
        });
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
  });
}

// Handle notification clicks + inline action responses.
//   - 'reply' (event.reply carries the typed text) or 'done' → write straight
//     from the SW via completeFromSW; on miss/non-2xx fall back to the
//     deep-link so the app finishes it on next open.
//   - 'open' / no action / 'snap it' → just open the app at the deep-link;
//     the in-app router auto-completes plain tasks and opens the right surface.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const d = event.notification.data || {};
  const outreachId = d.outreach_id || null;
  const actionKind = d.action_kind || null;
  const baseUrl = d.url || '/';
  const reply = event.reply || ''; // inline-text action payload (where supported)
  const action = event.action || '';

  // No outreach context → legacy behaviour: just open the target URL.
  if (!outreachId) {
    event.waitUntil(focusOrOpen(baseUrl));
    return;
  }

  const deepLink = (extraReply) => {
    let u = '/?complete_outreach=' + encodeURIComponent(outreachId);
    if (actionKind) u += '&ak=' + encodeURIComponent(actionKind);
    if (extraReply) u += '&reply=' + encodeURIComponent(extraReply);
    return u;
  };

  const actionMsg = {
    type: 'OUTREACH_ACTION',
    outreach_id: outreachId,
    action_kind: actionKind,
    reply_text: reply || null,
  };

  if (action === 'reply' || action === 'done') {
    // A confession/photo task must NOT be marked done without real content. An
    // empty inline 'Reply' (blank submit, or a platform that fires action:'reply'
    // with no text) would otherwise fall through to /complete and record an
    // answer that was never given — compliance that didn't happen. Open the app
    // so she actually writes/snaps it. ('done' is only ever offered on plain
    // tasks, which legitimately complete with no text.)
    if (action === 'reply' && (reply || '').trim().length === 0 &&
        (actionKind === 'confession' || actionKind === 'photo')) {
      event.waitUntil(focusOrOpen(deepLink(''), actionMsg));
      return;
    }
    event.waitUntil(
      completeFromSW(outreachId, { reply_text: reply }).then((ok) => {
        if (ok) {
          // Done from the lock screen. If a window is already open, message it
          // so it refreshes (no re-submit — the router dedups), but don't force
          // the app open over a successful background write.
          return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
              if (client.url.includes(self.location.origin)) {
                try { client.postMessage(actionMsg); } catch (e) { /* ignore */ }
              }
            }
            return undefined;
          });
        }
        // Token missing/expired or write failed → open the app and let the
        // in-app router complete it with the live session (deep-link + message).
        return focusOrOpen(deepLink(reply), actionMsg);
      })
    );
    return;
  }

  // Photo tasks ("Snap it") must NOT auto-complete — the user has to actually
  // take the photo. Just open the app (the photo-responder surface self-gates
  // on its own pending row); no complete deep-link, no completing message.
  if (actionKind === 'photo') {
    event.waitUntil(focusOrOpen(baseUrl));
    return;
  }

  // 'open' / plain body tap → open the app at the deep-link. An already-open
  // window gets the message so it completes without a reload. The in-app
  // router still skips photo/confession kinds; plain tasks complete on open.
  event.waitUntil(focusOrOpen(deepLink(''), actionMsg));
});
