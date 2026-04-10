/**
 * usePushNotifications — Web Notifications API integration for Handler outreach.
 *
 * Requests notification permission, tracks subscription state, and exposes
 * a `notify()` function for showing browser notifications when the tab is hidden.
 *
 * For true background push (app fully closed), uses the existing service worker's
 * push event listener in public/sw.js. This hook handles the in-tab-hidden case
 * which covers the primary use case: outreach polling finds a pending message
 * while the user has the tab backgrounded.
 *
 * Wire into useProactiveOutreach to fire notifications when outreach arrives
 * and document.hidden is true.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// ============================================
// TYPES
// ============================================

export interface PushNotificationState {
  /** Current permission status */
  permission: NotificationPermission | 'unsupported';
  /** Whether notifications are granted */
  isSubscribed: boolean;
  /** Request notification permission from the user */
  requestPermission: () => Promise<boolean>;
  /** Show a notification (works when tab is hidden) */
  notify: (title: string, body: string, options?: NotifyOptions) => void;
}

interface NotifyOptions {
  /** Override notification icon */
  icon?: string;
  /** Tag for deduplication */
  tag?: string;
  /** URL to open on click */
  url?: string;
  /** Require user interaction to dismiss */
  requireInteraction?: boolean;
  /** Bypass the throttle (for high-priority events like device commands) */
  bypassThrottle?: boolean;
  /** Vibration pattern */
  vibrate?: number[];
}

// ============================================
// PERMISSION STORAGE
// ============================================

const PERMISSION_KEY = 'bp_notification_permission_asked';

function hasAskedBefore(): boolean {
  try {
    return localStorage.getItem(PERMISSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(PERMISSION_KEY, 'true');
  } catch {
    // localStorage unavailable
  }
}

// ============================================
// SERVICE WORKER NOTIFICATION (for background tab)
// ============================================

async function showViaServiceWorker(
  title: string,
  body: string,
  options: NotifyOptions = {},
): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!reg) return false;

    await reg.showNotification(title, {
      body,
      icon: options.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: options.tag || 'handler-outreach',
      requireInteraction: options.requireInteraction || false,
      vibrate: options.vibrate || [200, 100, 200],
      data: { url: options.url || '/' },
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the service worker is registered. This is idempotent — calling
 * multiple times just returns the existing registration.
 */
async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Check for existing registration first
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[usePushNotifications] SW registration failed:', err);
    return null;
  }
}

// ============================================
// HOOK
// ============================================

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const lastNotifyRef = useRef(0);

  // Sync permission state on mount + auto-register service worker
  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);

    // Auto-register the service worker so notifications can be shown
    // even when the tab later becomes hidden. Idempotent.
    ensureServiceWorkerRegistered();
  }, []);

  // Store subscription state in Supabase when permission changes to granted
  useEffect(() => {
    if (permission !== 'granted' || !user?.id) return;

    // Record that this user has notifications enabled
    supabase
      .from('user_state')
      .update({ notifications_enabled: true })
      .eq('user_id', user.id)
      .then(() => {
        // Fire and forget
      });
  }, [permission, user?.id]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;

    // Already granted
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return true;
    }

    // Already denied — can't re-ask
    if (Notification.permission === 'denied') {
      setPermission('denied');
      return false;
    }

    markAsked();

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch {
      return false;
    }
  }, []);

  const notify = useCallback(
    (title: string, body: string, options: NotifyOptions = {}): void => {
      if (permission !== 'granted') return;

      // Throttle: no more than one notification per 30 seconds (unless bypassed)
      const now = Date.now();
      if (!options.bypassThrottle && now - lastNotifyRef.current < 30_000) return;
      lastNotifyRef.current = now;

      // Prefer service worker notification — works regardless of tab visibility
      // and is the only reliable path on mobile Chrome / installed PWAs.
      if ('serviceWorker' in navigator) {
        showViaServiceWorker(title, body, options).then((shown) => {
          if (shown) return;
          // Service worker path failed — fall back to direct Notification API
          try {
            const n = new Notification(title, {
              body,
              icon: options.icon || '/icons/icon-192.png',
              tag: options.tag || 'handler-outreach',
              requireInteraction: options.requireInteraction || false,
            });
            setTimeout(() => n.close(), 10_000);
          } catch {
            // noop
          }
        });
        return;
      }

      // No service worker available — direct Notification API
      try {
        const notification = new Notification(title, {
          body,
          icon: options.icon || '/icons/icon-192.png',
          tag: options.tag || 'handler-outreach',
          requireInteraction: options.requireInteraction || false,
        });
        setTimeout(() => notification.close(), 10_000);
      } catch {
        // Notification constructor failed (e.g., mobile Safari without PWA)
      }
    },
    [permission],
  );

  return {
    permission,
    isSubscribed: permission === 'granted',
    requestPermission,
    notify,
  };
}

// ============================================
// AUTO-REQUEST HELPER
// ============================================

/**
 * Call after a meaningful user interaction (e.g., completing first journal entry,
 * finishing onboarding) to request notification permission at a natural moment.
 * Returns true if permission was newly granted.
 */
export async function requestNotificationPermissionIfNeeded(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'default') return Notification.permission === 'granted';
  if (hasAskedBefore()) return false;

  markAsked();
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}
